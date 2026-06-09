import {buildReadMarker} from '../chat/read-marker';
import {canonicalJson} from '../canonical-json';
import {b64UrlToBytes} from '../identity/bundle';

describe('buildReadMarker', () => {
  test('signs the canonical JSON of every field except sender_signature', () => {
    const captured: {bytes?: Uint8Array} = {};
    const signDevice = (bytes: Uint8Array) => {
      captured.bytes = bytes;
      return new Uint8Array(64).fill(7);
    };

    const marker = buildReadMarker({
      conversationId: 'conv-1',
      lastReadEnvelopeId: 'env-9',
      senderAnchor: 'localhost:4200',
      readerDidFull: 'did:yawp:alice',
      signedBy: 'device-abc',
      signDevice,
      now: () => 1717804800000,
    });

    const {sender_signature: signature, ...unsigned} = marker;
    expect(unsigned).toEqual({
      conversation_id: 'conv-1',
      last_read_envelope_id: 'env-9',
      sender_anchor: 'localhost:4200',
      sender_did: 'did:yawp:alice',
      signed_by: 'device-abc',
      ts: 1717804800000,
    });

    // The signed bytes are exactly the canonical JSON of the unsigned payload.
    expect(captured.bytes).toEqual(new TextEncoder().encode(canonicalJson(unsigned)));
    // Signature decodes to the 64-byte device signature.
    expect(b64UrlToBytes(signature)).toEqual(new Uint8Array(64).fill(7));
  });
});
