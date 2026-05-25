
import {chacha20poly1305} from '@noble/ciphers/chacha.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {pbkdf2} from '@noble/hashes/pbkdf2.js';
import {sha256, sha512} from '@noble/hashes/sha2.js';

import {
  b64UrlToBytes,
  bytesToB64Url,
  isIdentityBundleV1,
  type IdentityBundleV1,
} from './bundle';

export const SEAL_PBKDF2_ITERS = 100_000;
export const SEAL_SALT_BYTES = 16;
export const SEAL_NONCE_BYTES = 12;
export const SEAL_INFO = 'yawp.identity.seal.v1';

/**
 * On-disk envelope when a passphrase is configured. Distinguished from the
 * raw v1 bundle by `version === 2 && sealed === true`.
 */
export type SealedEnvelopeV2 = {
  version: 2;
  sealed: true;
  /** base64url(16-byte salt) — fresh per seal. */
  salt: string;
  /** base64url(12-byte nonce) — fresh per seal. */
  nonce: string;
  /** base64url(ciphertext || poly1305 tag). */
  ciphertext: string;
};

export type SealedReason =
  | 'wrong_passphrase'
  | 'tampered'
  | 'malformed_envelope'
  | 'invalid_bundle';

export class UnsealError extends Error {
  readonly reason: SealedReason;
  constructor(reason: SealedReason, message?: string) {
    super(message ?? reason);
    this.name = 'UnsealError';
    this.reason = reason;
  }
}

export function isSealedEnvelopeV2(value: unknown): value is SealedEnvelopeV2 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 2 &&
    v.sealed === true &&
    typeof v.salt === 'string' &&
    typeof v.nonce === 'string' &&
    typeof v.ciphertext === 'string'
  );
}

/**
 * Derive the 32-byte symmetric key from a passphrase + salt. Exported so
 * tests can pin the derivation against the shared fixture.
 *
 * `_internal.iters` is an escape hatch for tests that don't need the full
 * 100_000-iteration cost on every assertion. Production callers must not
 * pass it. The shared fixture (`apps/yawp/priv/test_vectors/seal.json`)
 * is always exercised at the real iteration count.
 */
export function deriveSealKey(
  passphrase: string,
  salt: Uint8Array,
  _internal?: {iters?: number},
): Uint8Array {
  const iters = _internal?.iters ?? SEAL_PBKDF2_ITERS;
  const pwBytes = new TextEncoder().encode(passphrase.normalize('NFKC'));
  const stretched = pbkdf2(sha512, pwBytes, salt, {
    c: iters,
    dkLen: 32,
  });
  return hkdf(sha256, stretched, salt, new TextEncoder().encode(SEAL_INFO), 32);
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out);
    return out;
  }
  throw new Error('No secure random source available');
}

/**
 * Seal a bundle under a passphrase. Generates fresh salt + nonce per call,
 * and runs the full PBKDF2-HMAC-SHA512 stretching cost. Use this when the
 * user is setting or changing a passphrase.
 *
 * Optional `_internal` is used by tests to pin the salt + nonce; production
 * code must never pass it.
 */
export function sealBundle(
  bundle: IdentityBundleV1,
  passphrase: string,
  _internal?: {salt?: Uint8Array; nonce?: Uint8Array; iters?: number},
): SealedEnvelopeV2 {
  if (passphrase.length === 0) {
    throw new Error('sealBundle: passphrase must not be empty');
  }
  const salt = _internal?.salt ?? randomBytes(SEAL_SALT_BYTES);
  if (salt.length !== SEAL_SALT_BYTES) {
    throw new Error(`sealBundle: salt must be ${SEAL_SALT_BYTES} bytes`);
  }
  const key = deriveSealKey(passphrase, salt, {iters: _internal?.iters});
  return sealBundleWithKey(bundle, key, salt, {nonce: _internal?.nonce});
}

/**
 * re-seal a bundle with a pre-derived key + existing salt.
 *
 * Used when the user mutates identity-bundle metadata (display-name
 * override, second-anchor nudge state, …) on an already-unlocked but
 * sealed identity. We have the derived key cached from the original
 * unlock, so we skip PBKDF2 entirely and only generate a fresh nonce.
 * The salt is reused because it's per-passphrase, not per-write — fresh
 * salts only matter when the passphrase itself changes (`sealBundle`).
 */
export function sealBundleWithKey(
  bundle: IdentityBundleV1,
  sealKey: Uint8Array,
  salt: Uint8Array,
  _internal?: {nonce?: Uint8Array},
): SealedEnvelopeV2 {
  if (sealKey.length !== 32) {
    throw new Error('sealBundleWithKey: sealKey must be 32 bytes');
  }
  if (salt.length !== SEAL_SALT_BYTES) {
    throw new Error(`sealBundleWithKey: salt must be ${SEAL_SALT_BYTES} bytes`);
  }
  const nonce = _internal?.nonce ?? randomBytes(SEAL_NONCE_BYTES);
  if (nonce.length !== SEAL_NONCE_BYTES) {
    throw new Error(
      `sealBundleWithKey: nonce must be ${SEAL_NONCE_BYTES} bytes`,
    );
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const aad = new TextEncoder().encode(SEAL_INFO);
  const cipher = chacha20poly1305(sealKey, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return {
    version: 2,
    sealed: true,
    salt: bytesToB64Url(salt),
    nonce: bytesToB64Url(nonce),
    ciphertext: bytesToB64Url(ciphertext),
  };
}

/**
 * unseal an envelope and return both the bundle and the
 * derived seal key + salt that produced it. The context caches the key +
 * salt so that subsequent metadata mutations (display-name override,
 * nudge state) can re-seal without re-running PBKDF2.
 *
 * Throws `UnsealError` with a specific reason on any failure (wrong
 * passphrase, tampered ciphertext, malformed envelope, payload not a v1
 * bundle).
 */
export function unsealEnvelope(
  envelope: SealedEnvelopeV2,
  passphrase: string,
  _internal?: {iters?: number},
): {bundle: IdentityBundleV1; sealKey: Uint8Array; salt: Uint8Array} {
  if (!isSealedEnvelopeV2(envelope)) {
    throw new UnsealError('malformed_envelope');
  }
  let salt: Uint8Array;
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = b64UrlToBytes(envelope.salt);
    nonce = b64UrlToBytes(envelope.nonce);
    ciphertext = b64UrlToBytes(envelope.ciphertext);
  } catch {
    throw new UnsealError('malformed_envelope');
  }
  if (salt.length !== SEAL_SALT_BYTES || nonce.length !== SEAL_NONCE_BYTES) {
    throw new UnsealError('malformed_envelope');
  }
  const key = deriveSealKey(passphrase, salt, {iters: _internal?.iters});
  const aad = new TextEncoder().encode(SEAL_INFO);
  const cipher = chacha20poly1305(key, nonce, aad);
  let plaintext: Uint8Array;
  try {
    plaintext = cipher.decrypt(ciphertext);
  } catch {
    throw new UnsealError('wrong_passphrase');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new UnsealError('tampered', 'sealed payload is not valid JSON');
  }
  if (!isIdentityBundleV1(parsed)) {
    throw new UnsealError('invalid_bundle');
  }
  return {bundle: parsed, sealKey: key, salt};
}

/**
 * Convenience wrapper around `unsealEnvelope` that returns only the
 * bundle. Kept for callers that don't need the derived key.
 */
export function unsealBundle(
  envelope: SealedEnvelopeV2,
  passphrase: string,
  _internal?: {iters?: number},
): IdentityBundleV1 {
  return unsealEnvelope(envelope, passphrase, _internal).bundle;
}
