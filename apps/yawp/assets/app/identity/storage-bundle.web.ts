
import {STORAGE_KEY_V1, isIdentityBundleV1, type IdentityBundleV1} from './bundle';

export async function loadIdentity(): Promise<IdentityBundleV1 | null> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isIdentityBundleV1(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveIdentity(bundle: IdentityBundleV1): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(bundle));
}

export async function clearIdentityBundle(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY_V1);
}
