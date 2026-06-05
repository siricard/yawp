import {sha256} from '@noble/hashes/sha2.js';
import {chacha20poly1305} from '@noble/ciphers/chacha.js';

import {b64UrlToBytes, bytesToB64Url, type IdentityBundleV1} from './bundle';
import {
  SEAL_SALT_BYTES,
  SEAL_NONCE_BYTES,
  sealBundleWithKey,
  unsealEnvelopeWithKey,
  type SealedEnvelopeV2,
  type UnsealedEnvelopeResult,
} from './seal';

export type PasskeyWrappedSealV1 = {
  version: 1;
  credentialId: string;
  label: string;
  salt: string;
  wrappedSealKey?: {
    version: 1;
    nonce: string;
    ciphertext: string;
  };
  envelope?: SealedEnvelopeV2;
  enrolledAt: string;
};

const PRF_INPUT = new TextEncoder().encode('yawp.identity.passkey.v1');
const WRAP_INFO = new TextEncoder().encode('yawp.identity.passkey.wrap.v1');

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error('No secure random source available');
  return c;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  getCrypto().getRandomValues(out);
  return out;
}

function credentialRawId(credential: unknown): Uint8Array {
  const rawId = (credential as {rawId?: ArrayBuffer})?.rawId;
  if (!(rawId instanceof ArrayBuffer)) {
    throw new Error('Passkey credential did not include a raw id');
  }
  return new Uint8Array(rawId);
}

function prfOutput(credential: unknown): Uint8Array {
  const first = (credential as {
    getClientExtensionResults?: () => {prf?: {results?: {first?: ArrayBuffer}}};
  })?.getClientExtensionResults?.().prf?.results?.first;
  if (!(first instanceof ArrayBuffer) || first.byteLength < 32) {
    throw new Error('Passkey did not produce a usable PRF result');
  }
  return new Uint8Array(first);
}

function passkeySealKey(prf: Uint8Array): Uint8Array {
  return sha256(prf);
}

function wrapSealKey(sealKey: Uint8Array, wrappingKey: Uint8Array) {
  if (sealKey.length !== 32) {
    throw new Error('Passkey seal key wrap requires a 32-byte seal key');
  }
  const nonce = randomBytes(SEAL_NONCE_BYTES);
  const cipher = chacha20poly1305(wrappingKey, nonce, WRAP_INFO);
  return {
    version: 1 as const,
    nonce: bytesToB64Url(nonce),
    ciphertext: bytesToB64Url(cipher.encrypt(sealKey)),
  };
}

function unwrapSealKey(
  wrapped: NonNullable<PasskeyWrappedSealV1['wrappedSealKey']>,
  wrappingKey: Uint8Array,
): Uint8Array {
  if (wrapped.version !== 1) throw new Error('Unsupported passkey seal wrap');
  const nonce = b64UrlToBytes(wrapped.nonce);
  const ciphertext = b64UrlToBytes(wrapped.ciphertext);
  if (nonce.length !== SEAL_NONCE_BYTES) {
    throw new Error('Malformed passkey seal wrap');
  }
  const cipher = chacha20poly1305(wrappingKey, nonce, WRAP_INFO);
  const sealKey = cipher.decrypt(ciphertext);
  if (sealKey.length !== 32) throw new Error('Malformed passkey seal key');
  return sealKey;
}

export function browserMaySupportPasskeyPrf(): boolean {
  const g = globalThis as {
    PublicKeyCredential?: unknown;
    navigator?: {credentials?: unknown};
  };
  return !!g.navigator?.credentials && !!g.PublicKeyCredential;
}

export async function canUsePasskeyPrf(): Promise<boolean> {
  if (!browserMaySupportPasskeyPrf()) return false;
  const pkc = (globalThis as {
    PublicKeyCredential?: {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
  }).PublicKeyCredential;
  try {
    const platformAvailable =
      (await pkc?.isUserVerifyingPlatformAuthenticatorAvailable?.()) ?? true;
    if (!platformAvailable) return false;
    const caps = await pkc?.getClientCapabilities?.();
    if (caps && 'prf' in caps) return caps.prf === true;
    return false;
  } catch {
    return false;
  }
}

export async function enrollPasskeySeal(
  bundleOrSealKey: IdentityBundleV1 | Uint8Array,
  existingSalt?: Uint8Array,
): Promise<PasskeyWrappedSealV1> {
  if (!(await canUsePasskeyPrf())) {
    throw new Error('Passkeys are not available on this browser');
  }
  const challenge = randomBytes(32);
  const userId = randomBytes(32);
  const credential = await (globalThis.navigator as any).credentials.create({
    publicKey: {
      challenge,
      rp: {name: 'Yawp'},
      user: {
        id: userId,
        name: 'Yawp identity',
        displayName: 'Yawp identity',
      },
      pubKeyCredParams: [{type: 'public-key', alg: -7}],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      extensions: {prf: {eval: {first: PRF_INPUT}}},
      timeout: 60_000,
      attestation: 'none',
    },
  });
  if (!credential) throw new Error('Passkey enrollment was cancelled');
  const credentialId = credentialRawId(credential);
  const prf = prfOutput(credential);
  const wrappingKey = passkeySealKey(prf);
  const isSealKey = bundleOrSealKey instanceof Uint8Array;
  const salt = existingSalt ?? randomBytes(SEAL_SALT_BYTES);
  const wrappedSealKey = isSealKey
    ? wrapSealKey(bundleOrSealKey, wrappingKey)
    : undefined;
  const envelope = isSealKey
    ? undefined
    : sealBundleWithKey(bundleOrSealKey, wrappingKey, salt);
  return {
    version: 1,
    credentialId: bytesToB64Url(credentialId),
    label: 'This device passkey',
    salt: bytesToB64Url(salt),
    ...(wrappedSealKey ? {wrappedSealKey} : {envelope}),
    enrolledAt: new Date().toISOString(),
  };
}

export async function unlockPasskeySeal(
  passkey: PasskeyWrappedSealV1,
  currentEnvelope?: SealedEnvelopeV2,
): Promise<UnsealedEnvelopeResult> {
  if (!(await canUsePasskeyPrf())) {
    throw new Error('Passkeys are not available on this browser');
  }
  const challenge = randomBytes(32);
  const credential = await (globalThis.navigator as any).credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: 'public-key',
          id: b64UrlToBytes(passkey.credentialId),
        },
      ],
      userVerification: 'required',
      extensions: {prf: {eval: {first: PRF_INPUT}}},
      timeout: 60_000,
    },
  });
  if (!credential) throw new Error('Passkey unlock was cancelled');
  const wrappingKey = passkeySealKey(prfOutput(credential));
  if (passkey.wrappedSealKey) {
    if (!currentEnvelope) throw new Error('Passkey unlock needs a sealed envelope');
    return unsealEnvelopeWithKey(
      currentEnvelope,
      unwrapSealKey(passkey.wrappedSealKey, wrappingKey),
    );
  }
  if (!passkey.envelope) throw new Error('Malformed passkey seal');
  return unsealEnvelopeWithKey(passkey.envelope, wrappingKey);
}
