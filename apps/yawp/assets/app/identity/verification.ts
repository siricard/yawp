import {fingerprintFromDid, fingerprintFromPubkey} from './did';
import {b64UrlToBytes} from './bundle';

export type PeerVerificationStatus = 'verified' | 'key_changed';

export type PeerVerificationRecord = {
  peer_did: string;
  status: PeerVerificationStatus;
  fingerprint_at_verification: string;
  verified_at: string;
};

export function peerVerificationRecords(metadata: unknown): PeerVerificationRecord[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const records = (metadata as {peerVerification?: unknown}).peerVerification;
  if (!Array.isArray(records)) return [];
  return records.filter(isPeerVerificationRecord);
}

export function peerVerificationRecord(
  metadata: unknown,
  peerDid: string,
): PeerVerificationRecord | null {
  return (
    peerVerificationRecords(metadata).find(record => record.peer_did === peerDid) ?? null
  );
}

export function upsertVerifiedPeer(
  records: PeerVerificationRecord[],
  peerDid: string,
  fingerprint: string,
  verifiedAt: string,
): PeerVerificationRecord[] {
  const next: PeerVerificationRecord = {
    peer_did: peerDid,
    status: 'verified',
    fingerprint_at_verification: fingerprint,
    verified_at: verifiedAt,
  };
  return [next, ...records.filter(record => record.peer_did !== peerDid)];
}

export function detectKeyChanged(
  records: PeerVerificationRecord[],
  peerDid: string,
  masterPk: unknown,
): PeerVerificationRecord[] {
  const record = records.find(item => item.peer_did === peerDid);
  if (!record || record.status !== 'verified') return records;
  const fingerprint = fingerprintFromEnvelopeMasterPk(masterPk) ?? fingerprintFromDid(peerDid);
  if (!fingerprint || fingerprint === record.fingerprint_at_verification) return records;
  return records.map(item =>
    item.peer_did === peerDid ? {...item, status: 'key_changed'} : item,
  );
}

export function fingerprintFromEnvelopeMasterPk(masterPk: unknown): string | null {
  if (typeof masterPk !== 'string' || masterPk.trim().length === 0) return null;
  const trimmed = masterPk.trim();
  try {
    return fingerprintFromPubkey(b64UrlToBytes(trimmed));
  } catch {
    return null;
  }
}

function isPeerVerificationRecord(value: unknown): value is PeerVerificationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.peer_did === 'string' &&
    (record.status === 'verified' || record.status === 'key_changed') &&
    typeof record.fingerprint_at_verification === 'string' &&
    typeof record.verified_at === 'string'
  );
}
