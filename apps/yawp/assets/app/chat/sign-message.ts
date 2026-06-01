
import {canonicalJson} from '../canonical-json';

type Signer = (bytes: Uint8Array) => Uint8Array;

export type SendEnvelope = {
  channel_id: string;
  sender_did: string;
  body: string;
  reply_to_message_id: string | null;
  mentions: string[];
  attachments: Record<string, unknown>[];
  ts: number;
};

export type EditEnvelope = {
  message_id: string;
  body: string;
  ts: number;
};

export type DeleteEnvelope = {
  message_id: string;
  reason: string;
  actor_did: string;
  ts: number;
};

/**
 * Returns the canonical-JSON bytes that get signed. Exported so tests
 * (and the Elixir verifier) can compare byte-for-byte.
 */
export function buildSendCanonical(envelope: SendEnvelope): Uint8Array {
  return new TextEncoder().encode(canonicalJson(envelope));
}

export function buildEditCanonical(envelope: EditEnvelope): Uint8Array {
  return new TextEncoder().encode(canonicalJson(envelope));
}

export function buildDeleteCanonical(envelope: DeleteEnvelope): Uint8Array {
  return new TextEncoder().encode(canonicalJson(envelope));
}

/**
 * Sign the canonical-JSON of a send envelope and return the signature as
 * a base64url string (unpadded).
 */
export function signSend(envelope: SendEnvelope, signer: Signer): string {
  return bytesToBase64Url(signer(buildSendCanonical(envelope)));
}

export function signEdit(envelope: EditEnvelope, signer: Signer): string {
  return bytesToBase64Url(signer(buildEditCanonical(envelope)));
}

export function signDelete(envelope: DeleteEnvelope, signer: Signer): string {
  return bytesToBase64Url(signer(buildDeleteCanonical(envelope)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
