
import {STORAGE_KEY_V1, isIdentityBundleV1, type IdentityBundleV1} from './bundle';
import {isSealedEnvelopeV2, type SealedEnvelopeV2} from './seal';

export type StoredIdentityEntry =
  | {kind: 'unsealed'; bundle: IdentityBundleV1}
  | {kind: 'sealed'; envelope: SealedEnvelopeV2};

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export async function loadStoredEntry(): Promise<StoredIdentityEntry | null> {
  try {
    const ls = getLocalStorage();
    if (!ls) return null;
    const raw = ls.getItem(STORAGE_KEY_V1);
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
  const ls = getLocalStorage();
  if (!ls) return;
  const payload = entry.kind === 'unsealed' ? entry.bundle : entry.envelope;
  ls.setItem(STORAGE_KEY_V1, JSON.stringify(payload));
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
  const ls = getLocalStorage();
  if (!ls) return;
  ls.removeItem(STORAGE_KEY_V1);
}
