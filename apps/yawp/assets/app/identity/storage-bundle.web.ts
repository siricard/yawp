
import {isIdentityBundleV1, type IdentityBundleV1} from './bundle';
import {isSealedEnvelopeV2, type SealedEnvelopeV2} from './seal';

export type StoredIdentityEntry =
  | {kind: 'unsealed'; bundle: IdentityBundleV1}
  | {kind: 'sealed'; envelope: SealedEnvelopeV2; didPrefix?: string};

const DB_NAME = 'yawp.identity';
const STORE_NAME = 'yawp.identity';
const RECORD_KEY = 'v1';

const LEGACY_DB_NAME = 'yawp.identity.v1';
const LEGACY_STORE_NAME = 'yawp.identity.v1';

function getIndexedDB(): IDBFactory | null {
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as {indexedDB?: IDBFactory}).indexedDB) {
    return (globalThis as {indexedDB?: IDBFactory}).indexedDB!;
  }
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  return null;
}

function openDbRaw(
  idb: IDBFactory,
  name: string,
  onUpgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(name, 1);
    if (onUpgrade) {
      req.onupgradeneeded = () => onUpgrade(req.result);
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function deleteDb(idb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = idb.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function migrateFromLegacy(idb: IDBFactory): Promise<void> {
  try {
    const legacyDb = await openDbRaw(idb, LEGACY_DB_NAME);
    let payload: string | null = null;
    try {
      if (legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        const tx = legacyDb.transaction(LEGACY_STORE_NAME, 'readonly');
        const value = await awaitRequest(
          tx.objectStore(LEGACY_STORE_NAME).get(RECORD_KEY),
        );
        await awaitTx(tx);
        if (value != null) {
          payload = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
    } finally {
      legacyDb.close();
    }
    if (payload != null) {
      const newDb = await openDbRaw(idb, DB_NAME, (db) => {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      });
      try {
        const wtx = newDb.transaction(STORE_NAME, 'readwrite');
        wtx.objectStore(STORE_NAME).put(payload, RECORD_KEY);
        await awaitTx(wtx);
      } finally {
        newDb.close();
      }
    }
    await deleteDb(idb, LEGACY_DB_NAME);
  } catch {
  }
}

let migrationPromise: Promise<void> | null = null;

function ensureMigrated(idb: IDBFactory): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = migrateFromLegacy(idb);
  }
  return migrationPromise;
}

async function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  await ensureMigrated(idb);
  return openDbRaw(idb, DB_NAME, (db) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  });
}

/** @internal — test-only reset of the one-shot migration guard. */
export function __resetMigrationGuardForTests(): void {
  migrationPromise = null;
}

function awaitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRaw(): Promise<string | null> {
  const idb = getIndexedDB();
  if (!idb) return null;
  const db = await openDb(idb);
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const value = await awaitRequest(store.get(RECORD_KEY));
    await awaitTx(tx);
    if (typeof value === 'string') return value;
    if (value == null) return null;
    return JSON.stringify(value);
  } finally {
    db.close();
  }
}

async function writeRaw(payload: string): Promise<void> {
  const idb = getIndexedDB();
  if (!idb) return;
  const db = await openDb(idb);
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload, RECORD_KEY);
    await awaitTx(tx);
  } finally {
    db.close();
  }
}

async function deleteRaw(): Promise<void> {
  const idb = getIndexedDB();
  if (!idb) return;
  const db = await openDb(idb);
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    await awaitTx(tx);
  } finally {
    db.close();
  }
}

export async function loadStoredEntry(): Promise<StoredIdentityEntry | null> {
  try {
    const raw = await readRaw();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isSealedEnvelopeV2(parsed)) {
      const {didPrefix, ...envelope} = parsed as SealedEnvelopeV2 & {
        didPrefix?: unknown;
      };
      return {
        kind: 'sealed',
        envelope,
        didPrefix: typeof didPrefix === 'string' ? didPrefix : undefined,
      };
    }
    if (isIdentityBundleV1(parsed)) {
      return {kind: 'unsealed', bundle: parsed};
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadStoredEntryWithBiometrics(): Promise<StoredIdentityEntry | null> {
  return null;
}

export async function loadStoredEntryWithDevicePasscode(): Promise<StoredIdentityEntry | null> {
  return null;
}

export async function saveStoredEntry(entry: StoredIdentityEntry): Promise<void> {
  const payload =
    entry.kind === 'unsealed'
      ? entry.bundle
      : entry.didPrefix
        ? {...entry.envelope, didPrefix: entry.didPrefix}
        : entry.envelope;
  await writeRaw(JSON.stringify(payload));
}

export async function loadIdentity(): Promise<IdentityBundleV1 | null> {
  const entry = await loadStoredEntry();
  return entry && entry.kind === 'unsealed' ? entry.bundle : null;
}

export async function saveIdentity(bundle: IdentityBundleV1): Promise<void> {
  await saveStoredEntry({kind: 'unsealed', bundle});
}

export async function saveSealedEnvelope(
  envelope: SealedEnvelopeV2,
  didPrefix?: string,
): Promise<void> {
  await saveStoredEntry({kind: 'sealed', envelope, didPrefix});
}

export async function clearIdentityBundle(): Promise<void> {
  await deleteRaw();
}
