
import {defaultDisplayName} from '../identity/word-pair';
import {ADJECTIVES, ANIMALS} from '../identity/word-pair-lists';

describe('word-pair-lists', () => {
  test('both lists are exactly 256 entries (power of two → unbiased mod)', () => {
    expect(ADJECTIVES.length).toBe(256);
    expect(ANIMALS.length).toBe(256);
  });

  test('lists contain no duplicates', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
  });

  test('every entry is Title Case', () => {
    const titleCaseRe = /^[A-Z][a-z]+$/;
    for (const w of ADJECTIVES) expect(w).toMatch(titleCaseRe);
    for (const w of ANIMALS) expect(w).toMatch(titleCaseRe);
  });
});

describe('defaultDisplayName', () => {
  test('known-vector: identity test-fixture pk → "Fabled Marmot"', () => {
    const pkHex =
      '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8';
    const pk = new Uint8Array(
      pkHex.match(/.{2}/g)!.map(b => parseInt(b, 16)),
    );
    expect(defaultDisplayName(pk)).toBe('Fabled Marmot');
  });

  test('deterministic: same input → same output', () => {
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = i;
    expect(defaultDisplayName(pk)).toBe(defaultDisplayName(pk));
  });

  test('output is "<Adjective> <Animal>" with one space', () => {
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = 0xff;
    const out = defaultDisplayName(pk);
    const parts = out.split(' ');
    expect(parts.length).toBe(2);
    expect(ADJECTIVES).toContain(parts[0]);
    expect(ANIMALS).toContain(parts[1]);
  });

  test('distribution: 100 random pubkeys produce ≥ 80 distinct names', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const pk = new Uint8Array(32);
      let s = (i + 1) * 2654435761;
      for (let j = 0; j < 32; j++) {
        s = (s ^ (s << 13)) >>> 0;
        s = (s ^ (s >>> 17)) >>> 0;
        s = (s ^ (s << 5)) >>> 0;
        pk[j] = s & 0xff;
      }
      seen.add(defaultDisplayName(pk));
    }
    expect(seen.size).toBeGreaterThanOrEqual(80);
  });
});
