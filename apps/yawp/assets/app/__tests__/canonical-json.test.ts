/**
 * Shared canonical-JSON (RFC 8785) test vectors. The exact same fixture is
 * consumed by the Elixir test suite (test/yawp/canonical_json_test.exs) —
 * byte-for-byte agreement between platforms is the invariant.
 */

import {canonicalJson} from '../canonical-json';
import fixture from '../../../priv/test_vectors/canonical_json.json';

interface Vector {
  name: string;
  input: unknown;
  output: string;
}

describe('canonicalJson (RFC 8785)', () => {
  for (const v of fixture.vectors as Vector[]) {
    test(v.name, () => {
      expect(canonicalJson(v.input)).toBe(v.output);
    });
  }

  test('object key order is independent of insertion order', () => {
    expect(canonicalJson({b: 1, a: 2})).toBe(canonicalJson({a: 2, b: 1}));
  });

  test('round-trip stability: encode(JSON.parse(encode(x))) === encode(x)', () => {
    const x = {z: [1, {b: 2, a: 'hi'}], a: null};
    const once = canonicalJson(x);
    const twice = canonicalJson(JSON.parse(once));
    expect(twice).toBe(once);
  });

  test('throws on non-finite numbers', () => {
    expect(() => canonicalJson(Infinity)).toThrow();
    expect(() => canonicalJson(NaN)).toThrow();
  });
});
