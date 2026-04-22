
import * as ed from '@noble/ed25519';
import {sha512, sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

import {clearIdentityBundle, loadIdentity, saveIdentity} from './storage-bundle';
import {generateMaster, masterPkFromSk, signWithMaster} from './master';
import {generateDeviceSubkey} from './device';
import {bytesToB64Url, b64UrlToBytes, type IdentityBundleV1} from './bundle';
import './random';

ed.hashes.sha512 = sha512;

export const STORAGE_KEY = 'mook.identity.sk'; 
export const PK_FIELD = 'publicKey' as const;

/** Legacy alias returning the bare base58 DID. */
export function deriveDid(pk: Uint8Array): string {
  return bs58.encode(sha256(pk));
}

/** Legacy alias — derive a public key from a 32-byte Ed25519 seed. */
export function publicKeyFromSecret(seed: Uint8Array): Uint8Array {
  return ed.getPublicKey(seed) as Uint8Array;
}

export type Identity = {
  did: string;
} & {
  [K in typeof PK_FIELD]: Uint8Array;
};

async function getOrCreateBundle(): Promise<IdentityBundleV1> {
  const existing = await loadIdentity();
  if (existing) return existing;
  const master = generateMaster();
  const device = generateDeviceSubkey(master.sk);
  const bundle: IdentityBundleV1 = {
    version: 1,
    master: {sk: bytesToB64Url(master.sk)},
    device: {
      deviceId: device.deviceId,
      sk: bytesToB64Url(device.sk),
      pk: bytesToB64Url(device.pk),
      signature: bytesToB64Url(device.signature),
      issuedAt: device.issuedAt,
    },
  };
  await saveIdentity(bundle);
  return bundle;
}

/**
 * Legacy entry point returning `{did, [PK_FIELD]: pk}`. The persisted shape
 * is now the bundle; `did` is the bare base58 form so existing callers
 * that prefix `did:yawp:` themselves keep working.
 */
export async function getOrCreateIdentity(): Promise<Identity> {
  const bundle = await getOrCreateBundle();
  const masterSk = b64UrlToBytes(bundle.master.sk);
  const pk = masterPkFromSk(masterSk);
  return {did: deriveDid(pk), [PK_FIELD]: pk} as Identity;
}

/** Sign a message with the persisted identity's master key. */
export async function signWithIdentity(message: Uint8Array): Promise<Uint8Array> {
  const bundle = await loadIdentity();
  if (!bundle) {
    throw new Error('No identity present; call getOrCreateIdentity first.');
  }
  const masterSk = b64UrlToBytes(bundle.master.sk);
  return signWithMaster(masterSk, message);
}

/** Test helper: clear the stored identity. */
export async function clearIdentity(): Promise<void> {
  await clearIdentityBundle();
}
