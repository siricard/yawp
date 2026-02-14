
import {STORAGE_KEY} from './storage-key';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function loadSecret(): Promise<Uint8Array | null> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const bytes = base64ToBytes(raw);
    if (bytes.length !== 32) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function storeSecret(seed: Uint8Array): Promise<void> {
  window.localStorage.setItem(STORAGE_KEY, bytesToBase64(seed));
}

export async function clearSecret(): Promise<void> {
  window.localStorage.removeItem(STORAGE_KEY);
}
