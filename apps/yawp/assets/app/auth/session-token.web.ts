
export const SESSION_TOKEN_KEY = 'mook.session.token';

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
      }
}

export function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
      }
}

/**
 * Web localStorage is synchronous, so the token is always available
 * immediately. The promise resolves on the next microtask so the
 * platform-agnostic caller doesn't have to special-case web.
 */
export function whenSessionTokenLoaded(): Promise<void> {
  return Promise.resolve();
}

export function isSessionTokenLoaded(): boolean {
  return true;
}
