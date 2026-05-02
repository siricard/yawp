
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

/**
 * Derive a master keypair deterministically from a BIP-39 mnemonic. The
 * 64-byte seed produced by `mnemonicToSeed` is truncated to its first 32
 * bytes and used as the Ed25519 seed. This is the canonical path consumed
 * by the onboarding ceremony and the recovery flow.
 *
 * No passphrase parameter on purpose: recovery in must work with
 * only the 12 words. The at-rest seal in uses a separate passphrase
 * that wraps the storage blob, not the seed.
 */
export function masterFromMnemonicSeed(seed: Uint8Array): MasterKeypair {
  if (seed.length < 32) {
    throw new Error('masterFromMnemonicSeed: seed must be ≥ 32 bytes');
  }
  const sk = seed.slice(0, 32);
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
