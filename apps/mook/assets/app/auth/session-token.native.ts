
import * as Keychain from 'react-native-keychain';

export const SESSION_TOKEN_KEY = 'mook.session.token';

let cachedToken: string | null = null;
let loaded = false;

const loadPromise: Promise<void> = Keychain.getGenericPassword({
  service: SESSION_TOKEN_KEY,
})
  .then(creds => {
    if (creds && typeof creds.password === 'string') {
      cachedToken = creds.password;
    }
  })
  .catch(() => {
      })
  .finally(() => {
    loaded = true;
  });

/** Resolves once the initial keychain read completes. */
export function whenSessionTokenLoaded(): Promise<void> {
  return loadPromise;
}

export function getStoredToken(): string | null {
  return cachedToken;
}

export function setStoredToken(token: string): void {
  cachedToken = token;
  Keychain.setGenericPassword(SESSION_TOKEN_KEY, token, {
    service: SESSION_TOKEN_KEY,
  }).catch(() => {
      });
}

export function clearStoredToken(): void {
  cachedToken = null;
  Keychain.resetGenericPassword({service: SESSION_TOKEN_KEY}).catch(() => {
      });
}

export function isSessionTokenLoaded(): boolean {
  return loaded;
}
