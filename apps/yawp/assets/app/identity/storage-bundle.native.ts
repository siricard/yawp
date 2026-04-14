
import * as Keychain from 'react-native-keychain';

import {STORAGE_KEY_V1, isIdentityBundleV1, type IdentityBundleV1} from './bundle';

export class KeychainReadError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KeychainReadError';
    this.cause = cause;
  }
}

export async function loadIdentity(): Promise<IdentityBundleV1 | null> {
  let creds: Awaited<ReturnType<typeof Keychain.getGenericPassword>>;
  try {
    creds = await Keychain.getGenericPassword({service: STORAGE_KEY_V1});
  } catch (e) {
    throw new KeychainReadError(
      `Failed to read identity from keychain: ${(e as Error)?.message ?? e}`,
      e,
    );
  }
  if (!creds) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(creds.password);
  } catch (e) {
    throw new KeychainReadError(
      `Stored identity bundle is not valid JSON: ${(e as Error)?.message ?? e}`,
      e,
    );
  }
  if (!isIdentityBundleV1(parsed)) {
    throw new KeychainReadError('Stored identity bundle failed shape validation');
  }
  return parsed;
}

export async function saveIdentity(bundle: IdentityBundleV1): Promise<void> {
  await Keychain.setGenericPassword(STORAGE_KEY_V1, JSON.stringify(bundle), {
    service: STORAGE_KEY_V1,
  });
}

export async function clearIdentityBundle(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY_V1});
}
