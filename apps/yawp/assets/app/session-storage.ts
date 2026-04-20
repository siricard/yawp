
import {Platform} from 'react-native';

export type StoredSession = {
  sessionToken: string;
  refreshToken: string;
  expiresAt: string;
};

const STORAGE_PREFIX = 'yawp.session.v1.';
const nativeMemory = new Map<string, StoredSession>();

function key(anchorUrl: string): string {
  return STORAGE_PREFIX + anchorUrl.replace(/\/+$/, '');
}

export async function saveSession(
  anchorUrl: string,
  session: StoredSession,
): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key(anchorUrl), JSON.stringify(session));
      return;
    } catch {
    }
  }
  nativeMemory.set(key(anchorUrl), session);
}

export async function loadSession(
  anchorUrl: string,
): Promise<StoredSession | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key(anchorUrl));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.sessionToken === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        typeof parsed.expiresAt === 'string'
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
  return nativeMemory.get(key(anchorUrl)) ?? null;
}

export async function clearSession(anchorUrl: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(key(anchorUrl));
    } catch {
    }
  }
  nativeMemory.delete(key(anchorUrl));
}
