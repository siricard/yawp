
import {sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

/** `did:yawp:<base58(sha256(public_key))>`. */
export function didFromPubkey(publicKey: Uint8Array): string {
  return `did:yawp:${bs58.encode(sha256(publicKey))}`;
}

/**
 * Peer-verification fingerprint: the first 128 bits of
 * `sha256(master_public_key)`, rendered as `yp:` followed by four
 * groups of four lowercase hex characters separated by ` · `.
 *
 * yp:8f3a · d21c · 47ee · 0b91
 */
export function fingerprintFromPubkey(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
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
