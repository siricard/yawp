import {canonicalJson} from '../canonical-json';
import {bytesToB64Url} from '../identity/bundle';

export type ReadMarker = {
  conversation_id: string;
  last_read_envelope_id: string;
  sender_anchor: string;
  sender_did: string;
  signed_by: string;
  ts: number;
  sender_signature: string;
};

/**
 * Builds the signed `read_marker` pushed on the reader's `user:<did>` channel.
 *
 * The reader's anchor verifies the device signature over the canonical JSON of
 * every field except `sender_signature` (see
 * `YawpWeb.UserChannel.valid_read_marker?` →
 * `Yawp.Federation.DeviceSignature.verify/1`), then forwards a server-signed
 * receipt to `sender_anchor` — the original DM sender's anchor — which advances
 * the sender's per-recipient delivery state to `read`.
 */
export function buildReadMarker(input: {
  conversationId: string;
  lastReadEnvelopeId: string;
  senderAnchor: string;
  readerDidFull: string;
  signedBy: string;
  signDevice: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
}): ReadMarker {
  const unsigned = {
    conversation_id: input.conversationId,
    last_read_envelope_id: input.lastReadEnvelopeId,
    sender_anchor: input.senderAnchor,
    sender_did: input.readerDidFull,
    signed_by: input.signedBy,
    ts: (input.now ?? (() => Date.now()))(),
  };
  const signature = bytesToB64Url(
    input.signDevice(new TextEncoder().encode(canonicalJson(unsigned))),
  );
  return {...unsigned, sender_signature: signature};
}
