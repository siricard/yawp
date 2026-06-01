/**
 * Channel send/edit/delete canonical-JSON + ed25519 contract tests.
 *
 * We pin the canonical-JSON bytes for each envelope and verify that
 * signing them with a fixed ed25519 secret key produces a signature
 * the corresponding public key verifies. The send envelope must match
 * the Elixir `Yawp.Servers.Message.Changes.VerifySendSignature`
 * envelope byte-for-byte.
 *
 * Ed25519 is deterministic (RFC 8032), so signing the same bytes with
 * the same secret key always yields the same signature.
 */

import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';

import {
  buildSendCanonical,
  signDelete,
  signEdit,
  signSend,
  type SendEnvelope,
} from '../chat/sign-message';

(ed.hashes as unknown as {sha512: typeof sha512}).sha512 = sha512;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

const SK = hexToBytes(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
);

describe('signSend', () => {
  const envelope: SendEnvelope = {
    channel_id: '11111111-1111-4111-8111-111111111111',
    sender_did: 'did:yawp:zAlice',
    body: 'hello world',
    reply_to_message_id: null,
    mentions: [],
    attachments: [],
    ts: 1_700_000_000_000,
  };

  test('buildSendCanonical produces RFC 8785 ordered output matching the server envelope', () => {
    const str = new TextDecoder().decode(buildSendCanonical(envelope));
    expect(str).toBe(
      `{"attachments":[],"body":"hello world","channel_id":"11111111-1111-4111-8111-111111111111","mentions":[],"reply_to_message_id":null,"sender_did":"did:yawp:zAlice","ts":1700000000000}`,
    );
  });

  test('signSend round-trips through ed25519.verify', async () => {
    const pk = await ed.getPublicKey(SK);
    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, SK);
    const sig = b64UrlToBytes(signSend(envelope, signer));
    expect(sig.byteLength).toBe(64);
    expect(ed.verify(sig, buildSendCanonical(envelope), pk)).toBe(true);
  });

  test('signSend emits unpadded base64url (no =, no +/)', () => {
    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, SK);
    expect(signSend(envelope, signer)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('signEdit / signDelete', () => {
  test('signEdit verifies and is base64url', async () => {
    const pk = await ed.getPublicKey(SK);
    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, SK);
    const ts = 1_700_000_000_000;
    const env = {message_id: 'm-1', body: 'v2', ts};
    const sigB64 = signEdit(env, signer);
    expect(sigB64).toMatch(/^[A-Za-z0-9_-]+$/);
    const canonical = new TextEncoder().encode(
      `{"body":"v2","message_id":"m-1","ts":${ts}}`,
    );
    expect(ed.verify(b64UrlToBytes(sigB64), canonical, pk)).toBe(true);
  });

  test('signDelete verifies and is base64url', async () => {
    const pk = await ed.getPublicKey(SK);
    const signer = (bytes: Uint8Array): Uint8Array => ed.sign(bytes, SK);
    const ts = 1_700_000_000_000;
    const env = {
      message_id: 'm-1',
      reason: 'sender',
      actor_did: 'did:yawp:zAlice',
      ts,
    };
    const sigB64 = signDelete(env, signer);
    expect(sigB64).toMatch(/^[A-Za-z0-9_-]+$/);
    const canonical = new TextEncoder().encode(
      `{"actor_did":"did:yawp:zAlice","message_id":"m-1","reason":"sender","ts":${ts}}`,
    );
    expect(ed.verify(b64UrlToBytes(sigB64), canonical, pk)).toBe(true);
  });
});
