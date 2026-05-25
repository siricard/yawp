/**
 * passphrase-wrapped at-rest seal tests.
 *
 * Covers:
 * 1. Round-trip seal → unseal with the correct passphrase.
 * 2. Unseal with the wrong passphrase fails (Poly1305 tag mismatch).
 * 3. Tampering with the ciphertext / nonce / salt after sealing fails.
 * 4. PBKDF2 + HKDF + ChaCha20-Poly1305 vectors match the shared
 * fixture at apps/yawp/priv/test_vectors/seal.json (at the real
 * 100_000-iteration cost).
 * 5. Fresh seals use unique random salt + nonce per call.
 *
 * Most tests pass `_internal.iters: 1` to keep the suite under Jest's
 * default timeout. The fixture vectors test exercises the full 100_000
 * iterations so the production cost is pinned to the shared oracle on
 * every CI run.
 */

import {
  SEAL_INFO,
  SEAL_NONCE_BYTES,
  SEAL_SALT_BYTES,
  SealedEnvelopeV2,
  UnsealError,
  deriveSealKey,
  isSealedEnvelopeV2,
  sealBundle,
  sealBundleWithKey,
  unsealBundle,
  unsealEnvelope,
} from '../identity/seal';
import {b64UrlToBytes, type IdentityBundleV1} from '../identity/bundle';
import vectors from '../../../priv/test_vectors/seal.json';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

const SAMPLE_BUNDLE: IdentityBundleV1 = {
  version: 1,
  master: {sk: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'},
  device: {
    deviceId: '11111111-2222-3333-4444-555555555555',
    sk: 'IB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgE',
    pk: 'ICEgISAhICEgISAhICEgISAhICEgISAhICEgISAhIA',
    signature:
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    issuedAt: '2026-01-01T00:00:00.000Z',
  },
};

const PASSPHRASE = 'a strong passphrase';
const WRONG_PASSPHRASE = 'a different one';
const FAST = {iters: 1};

describe('seal', () => {
  test('envelope shape and roundtrip', () => {
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    expect(env.version).toBe(2);
    expect(env.sealed).toBe(true);
    expect(b64UrlToBytes(env.salt).length).toBe(SEAL_SALT_BYTES);
    expect(b64UrlToBytes(env.nonce).length).toBe(SEAL_NONCE_BYTES);
    expect(unsealBundle(env, PASSPHRASE, FAST)).toEqual(SAMPLE_BUNDLE);
  });

  test('fresh randomness per seal — repeated calls produce different envelopes', () => {
    const a = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    const b = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    expect(b.nonce).not.toBe(a.nonce);
    expect(b.salt).not.toBe(a.salt);
    expect(b.ciphertext).not.toBe(a.ciphertext);
    expect(unsealBundle(b, PASSPHRASE, FAST)).toEqual(SAMPLE_BUNDLE);
  });

  test('rejects wrong passphrase with reason=wrong_passphrase', () => {
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    try {
      unsealBundle(env, WRONG_PASSPHRASE, FAST);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnsealError);
      expect((e as UnsealError).reason).toBe('wrong_passphrase');
    }
  });

  test('detects ciphertext, nonce, and salt tampering', () => {
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    const tCipher: SealedEnvelopeV2 = {
      ...env,
      ciphertext:
        (env.ciphertext[0] === 'A' ? 'B' : 'A') + env.ciphertext.slice(1),
    };
    expect(() => unsealBundle(tCipher, PASSPHRASE, FAST)).toThrow(UnsealError);

    const tNonce: SealedEnvelopeV2 = {
      ...env,
      nonce: (env.nonce[0] === 'A' ? 'B' : 'A') + env.nonce.slice(1),
    };
    expect(() => unsealBundle(tNonce, PASSPHRASE, FAST)).toThrow(UnsealError);

    const tSalt: SealedEnvelopeV2 = {
      ...env,
      salt: (env.salt[0] === 'A' ? 'B' : 'A') + env.salt.slice(1),
    };
    expect(() => unsealBundle(tSalt, PASSPHRASE, FAST)).toThrow(UnsealError);
  });

  test('isSealedEnvelopeV2 and SEAL_INFO', () => {
    expect(SEAL_INFO).toBe('yawp.identity.seal.v1');
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    expect(isSealedEnvelopeV2(SAMPLE_BUNDLE)).toBe(false);
    expect(isSealedEnvelopeV2(env)).toBe(true);
    expect(isSealedEnvelopeV2(null)).toBe(false);
    expect(isSealedEnvelopeV2({version: 2, sealed: false})).toBe(false);
  });

  test('persisted blob (when sealed) contains no raw private key bytes', () => {
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    const blob = JSON.stringify(env);
    expect(blob).not.toContain(SAMPLE_BUNDLE.master.sk);
    expect(blob).not.toContain(SAMPLE_BUNDLE.device.sk);
    expect(blob).not.toContain(SAMPLE_BUNDLE.device.pk);
  });

  test('deriveSealKey is deterministic and 32 bytes', () => {
    const salt = new Uint8Array(16);
    salt.fill(7);
    const k1 = deriveSealKey('pp', salt, FAST);
    const k2 = deriveSealKey('pp', salt, FAST);
    expect(k1.length).toBe(32);
    expect(Array.from(k1)).toEqual(Array.from(k2));
    const k3 = deriveSealKey('pp2', salt, FAST);
    expect(Array.from(k3)).not.toEqual(Array.from(k1));
  });

  test('shared fixture: PBKDF2 → HKDF → ChaCha20-Poly1305 vectors match (real 100k iters)', () => {
    for (const v of vectors.vectors) {
      const fixedEnv = sealBundle(
        v.bundle as IdentityBundleV1,
        v.passphrase_utf8,
        {salt: hexToBytes(v.salt_hex), nonce: hexToBytes(v.nonce_hex)},
      );
      expect(bytesToHex(b64UrlToBytes(fixedEnv.ciphertext))).toBe(
        v.ciphertext_expected_hex,
      );
      expect(unsealBundle(fixedEnv, v.passphrase_utf8)).toEqual(v.bundle);
    }
  });

  test('sealBundleWithKey: round-trip with a pre-derived key + salt', () => {
    const salt = new Uint8Array(SEAL_SALT_BYTES);
    salt.fill(11);
    const sealKey = deriveSealKey(PASSPHRASE, salt, FAST);
    const env1 = sealBundleWithKey(SAMPLE_BUNDLE, sealKey, salt);
    const env2 = sealBundleWithKey(SAMPLE_BUNDLE, sealKey, salt);
    expect(env1.salt).toBe(env2.salt); 
    expect(env1.nonce).not.toBe(env2.nonce); 
    expect(unsealBundle(env1, PASSPHRASE, FAST)).toEqual(SAMPLE_BUNDLE);
    expect(unsealBundle(env2, PASSPHRASE, FAST)).toEqual(SAMPLE_BUNDLE);
  });

  test('sealBundleWithKey: bit-flipping the key produces an unseal failure', () => {
    const salt = new Uint8Array(SEAL_SALT_BYTES);
    salt.fill(13);
    const sealKey = deriveSealKey(PASSPHRASE, salt, FAST);
    const tampered = new Uint8Array(sealKey);
    tampered[0] ^= 0x01;
    const env = sealBundleWithKey(SAMPLE_BUNDLE, tampered, salt);
    expect(() => unsealBundle(env, PASSPHRASE, FAST)).toThrow(UnsealError);
  });

  test('unsealEnvelope: returns bundle + derived sealKey + salt', () => {
    const env = sealBundle(SAMPLE_BUNDLE, PASSPHRASE, FAST);
    const out = unsealEnvelope(env, PASSPHRASE, FAST);
    expect(out.bundle).toEqual(SAMPLE_BUNDLE);
    expect(out.sealKey.length).toBe(32);
    expect(out.salt.length).toBe(SEAL_SALT_BYTES);
    const reSealed = sealBundleWithKey(SAMPLE_BUNDLE, out.sealKey, out.salt);
    expect(unsealBundle(reSealed, PASSPHRASE, FAST)).toEqual(SAMPLE_BUNDLE);
  });

  test('shared fixture: PBKDF2 intermediate output matches', () => {
    const v = vectors.vectors[0];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {pbkdf2} = require('@noble/hashes/pbkdf2.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {sha512} = require('@noble/hashes/sha2.js');
    const stretched = pbkdf2(
      sha512,
      new TextEncoder().encode(v.passphrase_utf8.normalize('NFKC')),
      hexToBytes(v.salt_hex),
      {c: 100000, dkLen: 32},
    );
    expect(bytesToHex(stretched)).toBe(v.pbkdf2_output_derived_hex);
  });
});
