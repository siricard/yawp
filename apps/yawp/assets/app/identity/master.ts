
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

export type MasterKeypair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array; 
};

export function generateMaster(): MasterKeypair {
  const privateKey = ed.utils.randomSecretKey() as Uint8Array;
  const publicKey = ed.getPublicKey(privateKey) as Uint8Array;
  return {publicKey, privateKey};
}

/** Derive the public key from an existing 32-byte master seed. */
export function masterPublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey) as Uint8Array;
}

/** Sign arbitrary bytes with the master private key. */
export function signWithMaster(
  privateKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return ed.sign(message, privateKey) as Uint8Array;
}
