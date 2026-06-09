import {
  didFromPubkey,
  fingerprintFromDid,
  fingerprintFromPubkey,
} from '../identity/did';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

describe('fingerprintFromDid', () => {
  test('derives the same fingerprint from a DID as from the public key', () => {
    const pk = hexToBytes(
      '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
    );
    const did = didFromPubkey(pk);
    expect(fingerprintFromDid(did)).toBe(fingerprintFromPubkey(pk));
  });

  test('accepts a bare base58 suffix without the did:yawp: prefix', () => {
    const pk = hexToBytes(
      '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
    );
    const did = didFromPubkey(pk);
    const bare = did.slice('did:yawp:'.length);
    expect(fingerprintFromDid(bare)).toBe(fingerprintFromPubkey(pk));
  });

  test('formats as yp: followed by four hex quads', () => {
    const pk = hexToBytes(
      '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
    );
    const fingerprint = fingerprintFromDid(didFromPubkey(pk));
    expect(fingerprint).toMatch(/^yp:[0-9a-f]{4} · [0-9a-f]{4} · [0-9a-f]{4} · [0-9a-f]{4}$/);
  });

  test('returns null when the suffix is not decodable to 16 bytes', () => {
    expect(fingerprintFromDid('did:yawp:bob')).toBeNull();
    expect(fingerprintFromDid('did:yawp:')).toBeNull();
  });
});
