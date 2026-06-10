import {bytesToB64Url} from '../identity/bundle';
import {didFromPubkey, fingerprintFromPubkey} from '../identity/did';
import {
  detectKeyChanged,
  peerVerificationRecord,
  peerVerificationRecords,
  upsertVerifiedPeer,
} from '../identity/verification';

describe('peer verification metadata', () => {
  test('writes a verified peer record with the full fingerprint', () => {
    const pk = new Uint8Array(32).fill(4);
    const did = didFromPubkey(pk);
    const fingerprint = fingerprintFromPubkey(pk);
    const records = upsertVerifiedPeer([], did, fingerprint, '2026-06-10T00:00:00.000Z');

    expect(records).toEqual([
      {
        peer_did: did,
        status: 'verified',
        fingerprint_at_verification: fingerprint,
        verified_at: '2026-06-10T00:00:00.000Z',
      },
    ]);
    expect(peerVerificationRecord({peerVerification: records}, did)?.status).toBe('verified');
  });

  test('marks only verified peers as key changed when the master key fingerprint differs', () => {
    const oldPk = new Uint8Array(32).fill(1);
    const newPk = new Uint8Array(32).fill(2);
    const did = didFromPubkey(oldPk);
    const records = upsertVerifiedPeer([], did, fingerprintFromPubkey(oldPk), 'now');
    const next = detectKeyChanged(records, did, bytesToB64Url(newPk));

    expect(next[0].status).toBe('key_changed');
  });

  test('ignores unverified peers and matching master key fingerprints', () => {
    const pk = new Uint8Array(32).fill(8);
    const did = didFromPubkey(pk);
    const verified = upsertVerifiedPeer([], did, fingerprintFromPubkey(pk), 'now');

    expect(detectKeyChanged([], did, bytesToB64Url(pk))).toEqual([]);
    expect(detectKeyChanged(verified, did, bytesToB64Url(pk))).toBe(verified);
  });

  test('filters malformed metadata records', () => {
    expect(
      peerVerificationRecords({
        peerVerification: [
          {peer_did: 'did:yawp:x', status: 'verified', fingerprint_at_verification: 'yp:a', verified_at: 'now'},
          {peer_did: 'did:yawp:y', status: 'unverified'},
        ],
      }),
    ).toHaveLength(1);
  });
});
