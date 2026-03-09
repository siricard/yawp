
import {pbkdf2} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
import {sha512} from '@noble/hashes/sha2.js';
import {ENGLISH_WORDLIST} from './bip39-wordlist';

const WORD_INDEX = new Map<string, number>(
  ENGLISH_WORDLIST.map((w, i) => [w, i]),
);

const VALID_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

export type ValidateResult =
  | {ok: true}
  | {ok: false; reason: 'invalid_word_count' | 'unknown_word' | 'bad_checksum'};

const VALID_ENTROPY_LENGTHS = new Set([16, 20, 24, 28, 32]);

/**
 * Convert BIP-39 entropy to a mnemonic. Yawp only mints 12-word mnemonics
 * (128-bit entropy), but the function accepts the full BIP-39 range so
 * that the shared test fixture's official spec vectors round-trip.
 */
export function entropyToMnemonic(entropy: Uint8Array): string[] {
  if (!VALID_ENTROPY_LENGTHS.has(entropy.length)) {
    throw new Error(
      `entropyToMnemonic: unsupported entropy length ${entropy.length}`,
    );
  }
  const entropyBits = bytesToBitString(entropy);
  const checksumBits = checksum(entropy);
  const bits = entropyBits + checksumBits;
  const words: string[] = [];
  for (let i = 0; i < bits.length; i += 11) {
    const idx = parseInt(bits.slice(i, i + 11), 2);
    words.push(ENGLISH_WORDLIST[idx]);
  }
  return words;
}

/**
 * Validate any standard BIP-39 mnemonic (English wordlist): word count
 * 12/15/18/21/24, every word in the dictionary, checksum bits match.
 */
export function validateMnemonic(words: string[]): ValidateResult {
  if (!VALID_WORD_COUNTS.has(words.length)) {
    return {ok: false, reason: 'invalid_word_count'};
  }
  const indices: number[] = [];
  for (const w of words) {
    const i = WORD_INDEX.get(w);
    if (i === undefined) {
      return {ok: false, reason: 'unknown_word'};
    }
    indices.push(i);
  }
  const bits = indices.map(i => i.toString(2).padStart(11, '0')).join('');
  const checksumLen = bits.length / 33;
  const entropyBits = bits.slice(0, bits.length - checksumLen);
  const checksumBits = bits.slice(bits.length - checksumLen);
  const entropy = bitStringToBytes(entropyBits);
  if (checksum(entropy).slice(0, checksumLen) !== checksumBits) {
    return {ok: false, reason: 'bad_checksum'};
  }
  return {ok: true};
}

/**
 * Derive a 64-byte BIP-39 seed from a mnemonic + optional passphrase via
 * PBKDF2-HMAC-SHA512, 2048 iterations, salt = "mnemonic" + passphrase.
 * Both inputs are UTF-8 NFKD-encoded per the spec; we rely on the JS
 * runtime's String.prototype.normalize().
 */
export function mnemonicToSeed(words: string[], passphrase = ''): Uint8Array {
  const mnemonic = words.join(' ').normalize('NFKD');
  const salt = ('mnemonic' + passphrase).normalize('NFKD');
  return pbkdf2(sha512, encodeUtf8(mnemonic), encodeUtf8(salt), {
    c: 2048,
    dkLen: 64,
  });
}

function checksum(entropy: Uint8Array): string {
  const hash = sha256(entropy);
  const checksumLen = (entropy.length * 8) / 32;
  return bytesToBitString(hash).slice(0, checksumLen);
}

function bytesToBitString(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(2).padStart(8, '0');
  }
  return out;
}

function bitStringToBytes(bits: string): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
