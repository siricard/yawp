
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

export type MasterKeypair = {
  pk: Uint8Array; 
  sk: Uint8Array; 
};

export function generateMaster(): MasterKeypair {
  const sk = ed.utils.randomSecretKey() as Uint8Array;
  const pk = ed.getPublicKey(sk) as Uint8Array;
  return {pk, sk};
}

/** Derive the public key from an existing 32-byte master seed. */
export function masterPkFromSk(sk: Uint8Array): Uint8Array {
  return ed.getPublicKey(sk) as Uint8Array;
}

/** Sign arbitrary bytes with the master secret-key seed. */
export function signWithMaster(sk: Uint8Array, message: Uint8Array): Uint8Array {
  return ed.sign(message, sk) as Uint8Array;
}
