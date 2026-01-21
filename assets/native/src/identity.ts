
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';
import {sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';
import {fromByteArray, toByteArray} from 'base64-js';
import * as Keychain from 'react-native-keychain';

ed.hashes.sha512 = sha512;

export const STORAGE_KEY = 'mook.identity.sk';
export const PK_FIELD = 'publicKey' as const;

export type Identity = {
  did: string;
} & {
  [K in typeof PK_FIELD]: Uint8Array;
};

/** DID = base58(SHA-256(pk)). */
export function deriveDid(pk: Uint8Array): string {
  const digest = sha256(pk);
  return bs58.encode(digest);
}

/** Derive a public key from a 32-byte Ed25519 seed. */
export function publicKeyFromSecret(seed: Uint8Array): Uint8Array {
  return ed.getPublicKey(seed) as Uint8Array;
}

async function loadSecret(): Promise<Uint8Array | null> {
  try {
    const creds = await Keychain.getGenericPassword({service: STORAGE_KEY});
    if (!creds) {
      return null;
    }
    const bytes = toByteArray(creds.password);
    if (bytes.length !== 32) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

async function storeSecret(seed: Uint8Array): Promise<void> {
  await Keychain.setGenericPassword(STORAGE_KEY, fromByteArray(seed), {
    service: STORAGE_KEY,
  });
}

/**
 * Returns the persisted identity, generating and persisting a new one on
 * first call. Subsequent calls (including across cold-restarts) return the
 * same `{did, publicKey}`.
 */
export async function getOrCreateIdentity(): Promise<Identity> {
  let seed = await loadSecret();
  if (!seed) {
    seed = ed.utils.randomSecretKey() as Uint8Array;
    await storeSecret(seed);
  }
  const pk = publicKeyFromSecret(seed);
  const did = deriveDid(pk);
  return {did, [PK_FIELD]: pk} as Identity;
}

/** Sign a message with the persisted identity. */
export async function signWithIdentity(
  message: Uint8Array,
): Promise<Uint8Array> {
  const seed = await loadSecret();
  if (!seed) {
    throw new Error(
      'No identity present; call getOrCreateIdentity first.',
    );
  }
  return ed.sign(message, seed) as Uint8Array;
}

/** Test helper: clear the stored identity. */
export async function clearIdentity(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY});
}
