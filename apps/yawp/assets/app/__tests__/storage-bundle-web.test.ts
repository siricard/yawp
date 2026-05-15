/**
 * Web identity-bundle storage backend (IndexedDB).
 *
 * These tests pull in `storage-bundle.web` directly (bypassing the
 * Platform-driven `storage-bundle` shim) so we can verify the IndexedDB
 * implementation under `fake-indexeddb` regardless of the active Jest
 * platform preset. The shared bundle shape is unchanged.
 */

import {
  loadIdentity,
  saveIdentity,
  clearIdentityBundle,
  loadStoredEntry,
  saveSealedEnvelope,
} from '../identity/storage-bundle.web';
import {bytesToB64Url, type IdentityBundleV1} from '../identity/bundle';
import type {SealedEnvelopeV2} from '../identity/seal';

function makeBundle(overrides: Partial<IdentityBundleV1['device']> = {}): IdentityBundleV1 {
  const sk = new Uint8Array(32);
  const pk = new Uint8Array(32);
  const sig = new Uint8Array(64);
  for (let i = 0; i < sk.length; i++) sk[i] = i + 1;
  for (let i = 0; i < pk.length; i++) pk[i] = (i * 3) & 0xff;
  for (let i = 0; i < sig.length; i++) sig[i] = (i * 7) & 0xff;
  return {
    version: 1,
    master: {sk: bytesToB64Url(sk)},
    device: {
      deviceId: 'web-store-test-device',
      sk: bytesToB64Url(sk),
      pk: bytesToB64Url(pk),
      signature: bytesToB64Url(sig),
      issuedAt: '2026-05-27T00:00:00.000Z',
      ...overrides,
    },
  };
}

function makeSealedEnvelope(): SealedEnvelopeV2 {
  const salt = new Uint8Array(16);
  const nonce = new Uint8Array(12);
  const ct = new Uint8Array(64);
  for (let i = 0; i < salt.length; i++) salt[i] = i + 1;
  for (let i = 0; i < nonce.length; i++) nonce[i] = i + 10;
  for (let i = 0; i < ct.length; i++) ct[i] = (i * 5) & 0xff;
  return {
    version: 2,
    sealed: true,
    salt: bytesToB64Url(salt),
    nonce: bytesToB64Url(nonce),
    ciphertext: bytesToB64Url(ct),
  };
}

describe('storage-bundle.web (IndexedDB)', () => {
  beforeEach(async () => {
    await clearIdentityBundle();
  });

  test('saveIdentity → loadIdentity round-trips the bundle byte-for-byte', async () => {
    const bundle = makeBundle();
    await saveIdentity(bundle);
    const loaded = await loadIdentity();
    expect(loaded).toEqual(bundle);
  });

  test('clearIdentityBundle removes the persisted entry', async () => {
    await saveIdentity(makeBundle());
    expect(await loadIdentity()).not.toBeNull();
    await clearIdentityBundle();
    expect(await loadIdentity()).toBeNull();
    expect(await loadStoredEntry()).toBeNull();
  });

  test('loadIdentity returns null for a sealed envelope (forces caller to use loadStoredEntry)', async () => {
    const envelope = makeSealedEnvelope();
    await saveSealedEnvelope(envelope);
    expect(await loadIdentity()).toBeNull();
    const entry = await loadStoredEntry();
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind === 'sealed') {
      expect(entry!.envelope).toEqual(envelope);
    }
  });

  test('round-trips the nudge metadata (firstBoundAt + secondAnchorNudgeDismissed)', async () => {
    const bundle: IdentityBundleV1 = {
      ...makeBundle(),
      metadata: {
        firstBoundAt: '2026-03-01T00:00:00.000Z',
        secondAnchorNudgeDismissed: true,
      },
    };
    await saveIdentity(bundle);
    const loaded = await loadIdentity();
    expect(loaded).toEqual(bundle);
    expect(loaded!.metadata?.firstBoundAt).toBe('2026-03-01T00:00:00.000Z');
    expect(loaded!.metadata?.secondAnchorNudgeDismissed).toBe(true);
  });

  test('concurrent saves are serialized by IndexedDB and the latest write wins', async () => {
    const first = makeBundle({deviceId: 'concurrent-a'});
    const second = makeBundle({deviceId: 'concurrent-b'});
    const p1 = saveIdentity(first);
    const p2 = saveIdentity(second);
    await Promise.all([p1, p2]);
    const loaded = await loadIdentity();
    expect(loaded).not.toBeNull();
    expect(loaded!.device.deviceId).toBe('concurrent-b');
  });
});
