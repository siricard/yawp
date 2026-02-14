
import {fromByteArray, toByteArray} from 'base64-js';
import * as Keychain from 'react-native-keychain';

import {STORAGE_KEY} from './storage-key';

/**
 * Error thrown when the keychain is reachable but a read failed for any
 * reason other than "no entry yet" — e.g. locked keychain, cancelled
 * biometric prompt, missing entitlement (macOS errSecMissingEntitlement),
 * corrupt stored value. Surfacing this instead of returning `null` prevents
 * `getOrCreateIdentity` from silently regenerating the identity on
 * transient failures.
 */
export class KeychainReadError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KeychainReadError';
    this.cause = cause;
  }
}

/**
 * Returns the stored seed, or `null` IFF there is genuinely no entry yet.
 * Throws `KeychainReadError` for any other failure so the caller (and the
 * UI) can distinguish first-run from a real keychain problem.
 */
export async function loadSecret(): Promise<Uint8Array | null> {
  let creds: Awaited<ReturnType<typeof Keychain.getGenericPassword>>;
  try {
    creds = await Keychain.getGenericPassword({service: STORAGE_KEY});
  } catch (e) {
    throw new KeychainReadError(
      `Failed to read identity from keychain: ${(e as Error)?.message ?? e}`,
      e,
    );
  }
  if (!creds) {
    return null;
  }
  let bytes: Uint8Array;
  try {
    bytes = toByteArray(creds.password);
  } catch (e) {
    throw new KeychainReadError(
      `Stored identity is not valid base64: ${(e as Error)?.message ?? e}`,
      e,
    );
  }
  if (bytes.length !== 32) {
    throw new KeychainReadError(
      `Stored identity has wrong length: expected 32 bytes, got ${bytes.length}.`,
    );
  }
  return bytes;
}

export async function storeSecret(seed: Uint8Array): Promise<void> {
  await Keychain.setGenericPassword(STORAGE_KEY, fromByteArray(seed), {
    service: STORAGE_KEY,
  });
}

export async function clearSecret(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY});
}
