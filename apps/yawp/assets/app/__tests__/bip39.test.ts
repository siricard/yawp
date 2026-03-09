/**
 * Shared BIP-39 + HKDF-SHA256 test vectors. The same fixture is
 * consumed by the Elixir test suite (test/yawp/bip39_test.exs).
 * Byte-for-byte agreement is the invariant.
 */

import {
  entropyToMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from '../identity/bip39';
import {hkdfSha256} from '../identity/hkdf';
import fixture from '../../../priv/test_vectors/bip39.json';

interface OfficialVector {
  entropy_hex: string;
  mnemonic: string;
  passphrase: string;
  seed_hex: string;
}

interface YawpVector extends OfficialVector {
  master_derived_hex: string;
  bundle_derived_hex: string;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

describe('BIP-39 official English vectors', () => {
  for (const v of fixture.official_vectors as OfficialVector[]) {
    test(`entropy ${v.entropy_hex.slice(0, 16)}…`, () => {
      const entropy = hexToBytes(v.entropy_hex);
      const words = v.mnemonic.split(' ');
      expect(entropyToMnemonic(entropy)).toEqual(words);
      expect(validateMnemonic(words)).toEqual({ok: true});
      const seed = mnemonicToSeed(words, v.passphrase);
      expect(bytesToHex(seed)).toBe(v.seed_hex);
    });
  }
});

describe('Yawp-specific HKDF derivation vectors', () => {
  for (const v of fixture.yawp_vectors as YawpVector[]) {
    test(`entropy ${v.entropy_hex.slice(0, 16)}…`, () => {
      const entropy = hexToBytes(v.entropy_hex);
      const words = entropyToMnemonic(entropy);
      expect(words).toEqual(v.mnemonic.split(' '));
      const seed = mnemonicToSeed(words, v.passphrase);
      expect(bytesToHex(seed)).toBe(v.seed_hex);

      const master = hkdfSha256(
        seed,
        new TextEncoder().encode('yawp-master-v1'),
        new TextEncoder().encode('ed25519-seed'),
        32,
      );
      expect(bytesToHex(master)).toBe(v.master_derived_hex);

      const bundle = hkdfSha256(
        seed,
        new TextEncoder().encode('yawp-bundle-v1'),
        new TextEncoder().encode('chacha20-poly1305'),
        32,
      );
      expect(bytesToHex(bundle)).toBe(v.bundle_derived_hex);
    });
  }
});

describe('validateMnemonic', () => {
  test('rejects a bad checksum', () => {
    const bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'.split(
      ' ',
    );
    expect(validateMnemonic(bad)).toEqual({ok: false, reason: 'bad_checksum'});
  });

  test('rejects an invalid word count', () => {
    expect(validateMnemonic(['abandon', 'abandon'])).toEqual({
      ok: false,
      reason: 'invalid_word_count',
    });
  });

  test('rejects a word not in the dictionary', () => {
    const bad = 'notaword abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(
      ' ',
    );
    expect(validateMnemonic(bad)).toEqual({ok: false, reason: 'unknown_word'});
  });

  test('accepts the all-zero entropy mnemonic', () => {
    const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(
      ' ',
    );
    expect(validateMnemonic(words)).toEqual({ok: true});
  });

  test('accepts the all-ones entropy mnemonic', () => {
    const words = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'.split(
      ' ',
    );
    expect(validateMnemonic(words)).toEqual({ok: true});
  });
});

describe('entropyToMnemonic', () => {
  test('rejects non-128-bit entropy', () => {
    expect(() => entropyToMnemonic(new Uint8Array(8))).toThrow();
  });
});

describe('hkdfSha256 RFC 5869 vector', () => {
  test('test case 1', () => {
    const ikm = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    expect(bytesToHex(hkdfSha256(ikm, salt, info, 42))).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });
});
