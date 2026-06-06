import {conversationId, generateEnvelopeId, sign, verify} from '../chat/dm-envelope';
import {canonicalJson} from '../canonical-json';
import {sha256} from '@noble/hashes/sha2.js';
import {sha512} from '@noble/hashes/sha2.js';
import * as ed from '@noble/ed25519';
import {bytesToB64Url} from '../identity/bundle';
import {deviceDelegationMessage} from '../identity/device';

ed.hashes.sha512 = sha512;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('dm envelope', () => {
  test('conversationId derives from the sorted unique participant set', () => {
    const participants = ['did:yawp:alice', 'did:yawp:bob', 'did:yawp:carol'];
    const expected = hex(sha256(new TextEncoder().encode(canonicalJson(participants))));

    expect(
      conversationId('did:yawp:alice', [
        'did:yawp:bob',
        'did:yawp:carol',
        'did:yawp:bob',
      ]),
    ).toBe(expected);
    expect(conversationId('did:yawp:bob', ['did:yawp:carol', 'did:yawp:alice'])).toBe(
      expected,
    );
  });

  test('generateEnvelopeId emits a 128-bit base64url id', () => {
    const id = generateEnvelopeId(() => new Uint8Array(16).fill(255));

    expect(id).toBe('_____________________w');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test('sign and verify accept a delegated device subkey', async () => {
    const masterSk = new Uint8Array(32).fill(1);
    const deviceSk = new Uint8Array(32).fill(2);
    const masterPk = ed.getPublicKey(masterSk) as Uint8Array;
    const devicePk = ed.getPublicKey(deviceSk) as Uint8Array;
    const issuedAt = '2026-06-04T12:00:00.000Z';
    const deviceId = 'phone-1';
    const delegation = ed.sign(
      deviceDelegationMessage({deviceId, devicePk, issuedAt}),
      masterSk,
    ) as Uint8Array;
    const envelope = {
      envelope_id: generateEnvelopeId(() => new Uint8Array(16).fill(1)),
      sender_did: 'did:yawp:alice',
      signed_by: deviceId,
      sender_anchors: ['localhost:4000'],
      sender_profile_version: 1,
      recipient_dids: ['did:yawp:bob'],
      conversation_id: conversationId('did:yawp:alice', ['did:yawp:bob']),
      timestamp: '2026-06-04T12:00:01.000Z',
      body: 'hello',
      attachments: [],
      reply_to: null,
      mentions: [],
    };

    const signed = sign(envelope, bytes => ed.sign(bytes, deviceSk) as Uint8Array);
    const ppe = {
      public_key: bytesToB64Url(masterPk),
      device_subkeys: [
        {
          device_id: deviceId,
          pk: bytesToB64Url(devicePk),
          issued_at: issuedAt,
          signature: bytesToB64Url(delegation),
        },
      ],
    };

    await expect(verify(signed, ppe, ed.verify)).resolves.toBe(true);
    await expect(verify({...signed, body: 'tampered'}, ppe, ed.verify)).resolves.toBe(false);

    const mismatched = sign(
      {...signed, conversation_id: conversationId('did:yawp:alice', ['did:yawp:carol'])},
      bytes => ed.sign(bytes, deviceSk) as Uint8Array,
    );

    await expect(verify(mismatched, ppe, ed.verify)).resolves.toBe(false);
  });
});
