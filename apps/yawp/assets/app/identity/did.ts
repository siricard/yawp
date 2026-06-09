
import {sha256} from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

/** `did:yawp:<base58(sha256(pk))>`. */
export function didFromPubkey(pk: Uint8Array): string {
  return `did:yawp:${bs58.encode(sha256(pk))}`;
}

export const DID_PREFIX_LEN = 16;

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
  return formatFingerprint(sha256(pk));
}

/**
 * The same peer-verification fingerprint, derived from a `did:yawp:` string.
 * A DID is `did:yawp:<base58(sha256(master_pk))>`, so decoding the suffix
 * recovers the digest the fingerprint is built from — no public key needed.
 * Returns null when the suffix is not decodable to at least 16 bytes.
 */
export function fingerprintFromDid(did: string): string | null {
  const suffix = did.startsWith('did:yawp:') ? did.slice('did:yawp:'.length) : did;
  try {
    const digest = bs58.decode(suffix);
    if (digest.length < 16) return null;
    return formatFingerprint(digest);
  } catch {
    return null;
  }
}

function formatFingerprint(digest: Uint8Array): string {
  const first16 = digest.slice(0, 16);
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
