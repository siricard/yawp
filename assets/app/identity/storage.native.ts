
import {fromByteArray, toByteArray} from 'base64-js';
import * as Keychain from 'react-native-keychain';

import {STORAGE_KEY} from './storage-key';

export async function loadSecret(): Promise<Uint8Array | null> {
  try {
    const creds = await Keychain.getGenericPassword({service: STORAGE_KEY});
    if (!creds) {
      return null;
    }
    const bytes = toByteArray(creds.password);
    if (bytes.length !== 32) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function storeSecret(seed: Uint8Array): Promise<void> {
  await Keychain.setGenericPassword(STORAGE_KEY, fromByteArray(seed), {
    service: STORAGE_KEY,
  });
}

export async function clearSecret(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY});
}
