
import {STORAGE_KEY_V1, isIdentityBundleV1, type IdentityBundleV1} from './bundle';
import {isSealedEnvelopeV2, type SealedEnvelopeV2} from './seal';

export type StoredIdentityEntry =
  | {kind: 'unsealed'; bundle: IdentityBundleV1}
  | {kind: 'sealed'; envelope: SealedEnvelopeV2};

const DB_NAME = STORAGE_KEY_V1;
const STORE_NAME = STORAGE_KEY_V1;
const RECORD_KEY = 'v1';

function getIndexedDB(): IDBFactory | null {
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as {indexedDB?: IDBFactory}).indexedDB) {
    return (globalThis as {indexedDB?: IDBFactory}).indexedDB!;
  }
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  return null;
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
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
      return {kind: 'sealed', envelope: parsed};
    }
    if (isIdentityBundleV1(parsed)) {
      return {kind: 'unsealed', bundle: parsed};
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredEntry(entry: StoredIdentityEntry): Promise<void> {
  const payload = entry.kind === 'unsealed' ? entry.bundle : entry.envelope;
  await writeRaw(JSON.stringify(payload));
}

export async function loadIdentity(): Promise<IdentityBundleV1 | null> {
  const entry = await loadStoredEntry();
  return entry && entry.kind === 'unsealed' ? entry.bundle : null;
}

export async function saveIdentity(bundle: IdentityBundleV1): Promise<void> {
  await saveStoredEntry({kind: 'unsealed', bundle});
}

export async function saveSealedEnvelope(envelope: SealedEnvelopeV2): Promise<void> {
  await saveStoredEntry({kind: 'sealed', envelope});
}

export async function clearIdentityBundle(): Promise<void> {
  await deleteRaw();
}
