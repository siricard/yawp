/**
 * Pinned cross-platform mnemonic → master Ed25519 keypair
 * derivation vector. The same fixture must be honoured by the (eventual)
 * Elixir oracle; for now we lock the TypeScript side to the pinned bytes
 * so any regression on the HKDF context (`salt = "yawp-master-v1"`,
 * `info = "ed25519-seed"`, L=32) trips the suite immediately.
 */

import {mnemonicToSeed} from '../identity/bip39';
import {masterFromMnemonicSeed} from '../identity/master';
import {didFromPubkey} from '../identity/did';
import {bytesToB64Url} from '../identity/bundle';
import fixture from '../../../priv/test_vectors/mnemonic-to-master.json';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

describe('mnemonic → master keypair (HKDF-SHA256)', () => {
  test('pinned vector: PBKDF2 seed matches', () => {
    const words = fixture.mnemonic.split(' ');
    const seed = mnemonicToSeed(words, fixture.passphrase);
    expect(bytesToHex(seed)).toBe(fixture.bip39_seed_hex);
  });

  test('pinned vector: HKDF output and master public key match', () => {
    const seed = hexToBytes(fixture.bip39_seed_hex);
    const master = masterFromMnemonicSeed(seed);
    expect(bytesToHex(master.sk)).toBe(fixture.hkdf_output_hex);
    expect(bytesToB64Url(master.pk)).toBe(fixture.master_pk_b64u);
  });

  test('pinned vector: DID matches', () => {
    const words = fixture.mnemonic.split(' ');
    const seed = mnemonicToSeed(words, fixture.passphrase);
    const master = masterFromMnemonicSeed(seed);
    expect(didFromPubkey(master.pk)).toBe(fixture.did);
  });

  test('HKDF binding: derivation is NOT seed.slice(0, 32)', () => {
    const seed = hexToBytes(fixture.bip39_seed_hex);
    const truncated = seed.slice(0, 32);
    const master = masterFromMnemonicSeed(seed);
    expect(Array.from(master.sk)).not.toEqual(Array.from(truncated));
  });
});
