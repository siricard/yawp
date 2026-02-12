
import {sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

import {publicKeyFromSecret, deriveDid} from './identity';
import vector from '../../priv/test_vectors/identity.json';

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Odd-length hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export interface VectorResult {
  pass: boolean;
  details: {
    derivedPkHex: string;
    expectedPkHex: string;
    derivedDid: string;
    expectedDid: string;
    pkMatch: boolean;
    didMatch: boolean;
  };
}

/**
 * Derive a pubkey from the fixture's `sk_seed_hex`, derive a DID via
 * base58(SHA-256(pubkey)), and assert byte-exact match with `pk_hex` and
 * string-exact match with `did`.
 */
export function runIdentityVectorCheck(): VectorResult {
  const seed = hexToBytes(vector.sk_seed_hex);
  const derivedPk = publicKeyFromSecret(seed);
  const derivedPkHex = bytesToHex(derivedPk);
  const expectedPk = hexToBytes(vector.pk_hex);
  const pkMatch = bytesEqual(derivedPk, expectedPk);

  const directDid = bs58.encode(sha256(derivedPk));
  const moduleDid = deriveDid(derivedPk);
  const didMatch = directDid === vector.did && moduleDid === vector.did;

  return {
    pass: pkMatch && didMatch,
    details: {
      derivedPkHex,
      expectedPkHex: vector.pk_hex,
      derivedDid: directDid,
      expectedDid: vector.did,
      pkMatch,
      didMatch,
    },
  };
}
