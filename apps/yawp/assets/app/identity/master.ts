
import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';
import {hkdfSha256} from './hkdf';

ed.hashes.sha512 = sha512;

const MASTER_HKDF_SALT = new TextEncoder().encode('yawp-master-v1');
const MASTER_HKDF_INFO = new TextEncoder().encode('ed25519-seed');

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
 * Derive a master keypair deterministically from a BIP-39 mnemonic seed.
 * The 64-byte PBKDF2 seed is fed into HKDF-SHA256 with a fixed
 * domain-separation context (`salt = "yawp-master-v1"`,
 * `info = "ed25519-seed"`) to produce the 32-byte Ed25519 seed. This is
 * the canonical path consumed by the onboarding ceremony
 * and the recovery flow.
 *
 * **Do not truncate the BIP-39 seed** — HKDF binds the derivation to the
 * Yawp context so two unrelated derivation paths can never collide on the
 * same seed bytes. See `apps/yawp/priv/test_vectors/mnemonic-to-master.json`
 * for the pinned cross-platform oracle.
 *
 * No passphrase parameter on purpose: recovery in must work with
 * only the 12 words. The at-rest seal in uses a separate passphrase
 * that wraps the storage blob, not the seed.
 */
export function masterFromMnemonicSeed(seed: Uint8Array): MasterKeypair {
  if (seed.length < 32) {
    throw new Error('masterFromMnemonicSeed: seed must be ≥ 32 bytes');
  }
  const sk = hkdfSha256(seed, MASTER_HKDF_SALT, MASTER_HKDF_INFO, 32);
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
