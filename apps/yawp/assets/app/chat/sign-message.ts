
import {canonicalJson} from '../canonical-json';

export type MessagePayload = {
  channel_id: string;
  body: string;
  ts: number;
};

/**
 * Returns the canonical-JSON bytes that get signed. Exported so tests
 * (and the Elixir verifier) can compare byte-for-byte.
 */
export function buildMessageCanonical(payload: MessagePayload): Uint8Array {
  return new TextEncoder().encode(canonicalJson(payload));
}

/**
 * Sign the canonical-JSON of `{channel_id, body, ts}` with `signer`
 * (typically `identity.signDevice`) and return the signature as a
 * base64url string (unpadded).
 */
export function signMessage(
  payload: MessagePayload,
  signer: (bytes: Uint8Array) => Uint8Array,
): string {
  const canonical = buildMessageCanonical(payload);
  const sig = signer(canonical);
  return bytesToBase64Url(sig);
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
