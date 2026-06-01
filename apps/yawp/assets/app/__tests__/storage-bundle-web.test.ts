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
  __resetMigrationGuardForTests,
} from '../identity/storage-bundle.web';
import {bytesToB64Url, type IdentityBundleV1} from '../identity/bundle';
import type {SealedEnvelopeV2} from '../identity/seal';

const DB_NAME = 'yawp.identity';
const STORE_NAME = 'yawp.identity';
const RECORD_KEY = 'v1';
const LEGACY_DB_NAME = 'yawp.identity.v1';
const LEGACY_STORE_NAME = 'yawp.identity.v1';

function awaitReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function awaitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

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
    __resetMigrationGuardForTests();
    await deleteDb(DB_NAME);
    await deleteDb(LEGACY_DB_NAME);
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

  test('persists didPrefix alongside a sealed envelope and reads it back', async () => {
    const envelope = makeSealedEnvelope();
    await saveSealedEnvelope(envelope, 'did:yawp:z6MkPx12');
    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind === 'sealed') {
      expect(entry!.envelope).toEqual(envelope);
      expect(entry!.didPrefix).toBe('did:yawp:z6MkPx12');
    }
  });

  test('a legacy sealed envelope (no didPrefix) reads back with didPrefix undefined', async () => {
    const envelope = makeSealedEnvelope();
    await saveSealedEnvelope(envelope);
    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind === 'sealed') {
      expect(entry!.didPrefix).toBeUndefined();
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

  test('uses the schema: DB `yawp.identity`, store `yawp.identity`, key `v1`', async () => {
    const bundle = makeBundle();
    await saveIdentity(bundle);

    const openReq = indexedDB.open(DB_NAME);
    const db = await awaitReq(openReq);
    try {
      expect(Array.from(db.objectStoreNames)).toContain(STORE_NAME);
      const tx = db.transaction(STORE_NAME, 'readonly');
      const keys = await awaitReq(tx.objectStore(STORE_NAME).getAllKeys());
      await awaitTx(tx);
      expect(keys).toEqual([RECORD_KEY]);
    } finally {
      db.close();
    }

    const legacyDbs = await (indexedDB as IDBFactory & {databases?: () => Promise<{name?: string}[]>})
      .databases?.();
    if (legacyDbs) {
      expect(legacyDbs.find((d) => d.name === LEGACY_DB_NAME)).toBeUndefined();
    }
  });

  test('one-shot migration: pre-fix `yawp.identity.v1` DB is read into new DB and dropped', async () => {
    const bundle = makeBundle({deviceId: 'pre-fix-device'});
    const legacyPayload = JSON.stringify(bundle);

    const upgradeReq = indexedDB.open(LEGACY_DB_NAME, 1);
    upgradeReq.onupgradeneeded = () => {
      const db = upgradeReq.result;
      db.createObjectStore(LEGACY_STORE_NAME);
    };
    const legacyDb = await awaitReq(upgradeReq);
    const wtx = legacyDb.transaction(LEGACY_STORE_NAME, 'readwrite');
    wtx.objectStore(LEGACY_STORE_NAME).put(legacyPayload, RECORD_KEY);
    await awaitTx(wtx);
    legacyDb.close();

    {
      const sanityDb = await awaitReq(indexedDB.open(LEGACY_DB_NAME));
      expect(Array.from(sanityDb.objectStoreNames)).toContain(LEGACY_STORE_NAME);
      sanityDb.close();
    }

    __resetMigrationGuardForTests();
    const loaded = await loadIdentity();
    expect(loaded).toEqual(bundle);

    const newDb = await awaitReq(indexedDB.open(DB_NAME));
    try {
      expect(Array.from(newDb.objectStoreNames)).toContain(STORE_NAME);
      const tx = newDb.transaction(STORE_NAME, 'readonly');
      const keys = await awaitReq(tx.objectStore(STORE_NAME).getAllKeys());
      const value = await awaitReq(tx.objectStore(STORE_NAME).get(RECORD_KEY));
      await awaitTx(tx);
      expect(keys).toEqual([RECORD_KEY]);
      expect(typeof value).toBe('string');
      expect(JSON.parse(value as string)).toEqual(bundle);
    } finally {
      newDb.close();
    }

    const dbsFn = (indexedDB as IDBFactory & {databases?: () => Promise<{name?: string}[]>}).databases;
    if (dbsFn) {
      const dbs = await dbsFn.call(indexedDB);
      expect(dbs.find((d) => d.name === LEGACY_DB_NAME)).toBeUndefined();
    } else {
      const probeReq = indexedDB.open(LEGACY_DB_NAME);
      const probeDb = await awaitReq(probeReq);
      expect(Array.from(probeDb.objectStoreNames)).toEqual([]);
      probeDb.close();
      await deleteDb(LEGACY_DB_NAME);
    }
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
