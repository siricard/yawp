
import * as Keychain from 'react-native-keychain';

import {STORAGE_KEY_V1, isIdentityBundleV1, type IdentityBundleV1} from './bundle';
import {isSealedEnvelopeV2, type SealedEnvelopeV2} from './seal';

export type StoredIdentityEntry =
  | {kind: 'unsealed'; bundle: IdentityBundleV1}
  | {kind: 'sealed'; envelope: SealedEnvelopeV2; didPrefix?: string};

export class KeychainReadError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KeychainReadError';
    this.cause = cause;
  }
}

const keychainAccessControl =
  Keychain.ACCESS_CONTROL?.BIOMETRY_CURRENT_SET ??
  Keychain.ACCESS_CONTROL?.BIOMETRY_ANY;

const keychainAccessible =
  Keychain.ACCESSIBLE?.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY ??
  Keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

const keychainOptions = {
  service: STORAGE_KEY_V1,
  accessControl: keychainAccessControl,
  accessible: keychainAccessible,
  authenticationType:
    Keychain.AUTHENTICATION_TYPE?.DEVICE_PASSCODE_OR_BIOMETRICS,
  authenticationPrompt: {
    title: 'Unlock Yawp',
    subtitle: 'Use biometrics or device passcode to unlock your identity',
    description: 'Your identity material stays on this device.',
    cancel: 'Use another method',
  },
};

export async function loadStoredEntry(): Promise<StoredIdentityEntry | null> {
  let creds: Awaited<ReturnType<typeof Keychain.getGenericPassword>>;
  try {
    creds = await Keychain.getGenericPassword(keychainOptions);
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
  if (isSealedEnvelopeV2(parsed)) {
    const {didPrefix, ...envelope} = parsed as SealedEnvelopeV2 & {
      didPrefix?: unknown;
    };
    return {
      kind: 'sealed',
      envelope,
      didPrefix: typeof didPrefix === 'string' ? didPrefix : undefined,
    };
  }
  if (isIdentityBundleV1(parsed)) {
    return {kind: 'unsealed', bundle: parsed};
  }
  throw new KeychainReadError('Stored identity payload failed shape validation');
}

export async function saveStoredEntry(entry: StoredIdentityEntry): Promise<void> {
  const payload =
    entry.kind === 'unsealed'
      ? entry.bundle
      : entry.didPrefix
        ? {...entry.envelope, didPrefix: entry.didPrefix}
        : entry.envelope;
  await Keychain.setGenericPassword(STORAGE_KEY_V1, JSON.stringify(payload), {
    ...keychainOptions,
  });
}

export async function loadIdentity(): Promise<IdentityBundleV1 | null> {
  const entry = await loadStoredEntry();
  return entry && entry.kind === 'unsealed' ? entry.bundle : null;
}

export async function saveIdentity(bundle: IdentityBundleV1): Promise<void> {
  await saveStoredEntry({kind: 'unsealed', bundle});
}

export async function saveSealedEnvelope(
  envelope: SealedEnvelopeV2,
  didPrefix?: string,
): Promise<void> {
  await saveStoredEntry({kind: 'sealed', envelope, didPrefix});
}

export async function clearIdentityBundle(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY_V1});
}
