
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

ed.hashes.sha512 = sha512;

export const STORAGE_KEY = "mook.identity.sk";
export const PK_FIELD = "publicKey" as const;

export type Identity = {
  did: string;
} & {
  [K in typeof PK_FIELD]: Uint8Array;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** DID = base58(SHA-256(pk)). */
export function deriveDid(pk: Uint8Array): string {
  const digest = sha256(pk);
  return bs58.encode(digest);
}

/** Derive a public key from a 32-byte Ed25519 seed. */
export function publicKeyFromSecret(seed: Uint8Array): Uint8Array {
  return ed.getPublicKey(seed) as Uint8Array;
}

function loadSecret(): Uint8Array | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const bytes = base64ToBytes(raw);
    if (bytes.length !== 32) return null;
    return bytes;
  } catch {
    return null;
  }
}

function storeSecret(seed: Uint8Array): void {
  window.localStorage.setItem(STORAGE_KEY, bytesToBase64(seed));
}

/**
 * Returns the persisted identity, generating and persisting a new one on
 * first call. Subsequent calls return the same `{did, publicKey}`.
 */
export function getOrCreateIdentity(): Identity {
  let seed = loadSecret();
  if (!seed) {
    seed = ed.utils.randomSecretKey() as Uint8Array;
    storeSecret(seed);
  }
  const pk = publicKeyFromSecret(seed);
  const did = deriveDid(pk);
  return { did, [PK_FIELD]: pk } as Identity;
}

/** Sign a message with the persisted identity. */
export function signWithIdentity(message: Uint8Array): Uint8Array {
  const seed = loadSecret();
  if (!seed) throw new Error("No identity present; call getOrCreateIdentity first.");
  return ed.sign(message, seed) as Uint8Array;
}

/** Test helper: clear the stored identity. */
export function clearIdentity(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
