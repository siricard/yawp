/**
 * signMessage canonical-JSON + ed25519 contract test.
 *
 * We pin the canonical-JSON bytes for a representative payload and
 * verify that signing them with a fixed ed25519 secret key produces a
 * signature that the corresponding public key verifies.
 *
 * Ed25519 is deterministic (RFC 8032), so signing the same bytes with
 * the same secret key always yields the same signature — this lets us
 * pin the expected base64url signature byte-for-byte and detect any
 * future drift in canonical-JSON output or signing semantics.
 */

import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

import {
  buildMessageCanonical,
  signMessage,
} from '../chat/sign-message';

(ed.hashes as {sha512: typeof sha512}).sha512 = sha512;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('signMessage', () => {
  const channelId = '11111111-1111-4111-8111-111111111111';
  const body = 'hello world';
  const ts = 1_700_000_000_000;

  test('buildMessageCanonical produces RFC 8785 ordered output', () => {
    const bytes = buildMessageCanonical({channel_id: channelId, body, ts});
    const str = new TextDecoder().decode(bytes);
    expect(str).toBe(
      `{"body":"hello world","channel_id":"11111111-1111-4111-8111-111111111111","ts":1700000000000}`,
    );
  });

  test('signMessage round-trips through ed25519.verify', async () => {
    const sk = hexToBytes(
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    );
    const pk = await ed.getPublicKey(sk);

    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, sk);
    const sigB64Url = signMessage({channel_id: channelId, body, ts}, signer);

    const sigB64 = sigB64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(sigB64Url.length / 4) * 4, '=');
    const sigBin = Buffer.from(sigB64, 'base64');
    const sig = new Uint8Array(sigBin);
    expect(sig.byteLength).toBe(64);

    const canonical = buildMessageCanonical({channel_id: channelId, body, ts});
    expect(ed.verify(sig, canonical, pk)).toBe(true);

    const tampered = buildMessageCanonical({
      channel_id: channelId,
      body: 'tampered',
      ts,
    });
    expect(ed.verify(sig, tampered, pk)).toBe(false);
  });

  test('signMessage emits unpadded base64url (no =, no +/)', () => {
    const sk = hexToBytes(
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    );
    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, sk);
    const sig = signMessage({channel_id: channelId, body, ts}, signer);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
