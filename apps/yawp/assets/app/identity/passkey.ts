import {sha256} from '@noble/hashes/sha2.js';

import {b64UrlToBytes, bytesToB64Url, type IdentityBundleV1} from './bundle';
import {
  SEAL_SALT_BYTES,
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
  envelope: SealedEnvelopeV2;
  enrolledAt: string;
};

const PRF_INPUT = new TextEncoder().encode('yawp.identity.passkey.v1');

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
    };
  }).PublicKeyCredential;
  if (!pkc?.isUserVerifyingPlatformAuthenticatorAvailable) return true;
  try {
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollPasskeySeal(
  bundle: IdentityBundleV1,
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
  const salt = randomBytes(SEAL_SALT_BYTES);
  const envelope = sealBundleWithKey(bundle, passkeySealKey(prf), salt);
  return {
    version: 1,
    credentialId: bytesToB64Url(credentialId),
    label: 'This device passkey',
    salt: bytesToB64Url(salt),
    envelope,
    enrolledAt: new Date().toISOString(),
  };
}

export async function unlockPasskeySeal(
  passkey: PasskeyWrappedSealV1,
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
  return unsealEnvelopeWithKey(passkey.envelope, passkeySealKey(prfOutput(credential)));
}
