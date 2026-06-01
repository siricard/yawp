
import {sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

/** `did:yawp:<base58(sha256(pk))>`. */
export function didFromPubkey(pk: Uint8Array): string {
  return `did:yawp:${bs58.encode(sha256(pk))}`;
}

export const DID_PREFIX_LEN = 16;

/**
 * The leading slice of a DID, long enough to tell two identities apart on
 * the same device without persisting the full identifier in cleartext
 * beside a sealed envelope.
 */
export function didPrefix(did: string, len: number = DID_PREFIX_LEN): string {
  return did.slice(0, len);
}

/**
 * Peer-verification fingerprint: the first 128 bits of
 * `sha256(master_pk)`, rendered as `yp:` followed by four groups of four
 * lowercase hex characters separated by ` · `.
 *
 * yp:8f3a · d21c · 47ee · 0b91
 */
export function fingerprintFromPubkey(pk: Uint8Array): string {
  const hash = sha256(pk);
  const first16 = hash.slice(0, 16);
  let hex = '';
  for (let i = 0; i < first16.length; i++) {
    hex += first16[i].toString(16).padStart(2, '0');
  }
  const groups: string[] = [];
  for (let i = 0; i < 4; i++) {
    groups.push(hex.slice(i * 4, i * 4 + 4));
  }
  return 'yp:' + groups.join(' · ');
}
