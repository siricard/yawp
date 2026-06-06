
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
const sealedFallbackService = `${STORAGE_KEY_V1}.sealed`;

const keychainOptions = {
  service: STORAGE_KEY_V1,
  accessControl:
    Keychain.ACCESS_CONTROL?.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE ??
    keychainAccessControl,
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

const biometricOnlyOptions = {
  ...keychainOptions,
  accessControl: keychainAccessControl,
  authenticationType: Keychain.AUTHENTICATION_TYPE?.BIOMETRICS,
};

const devicePasscodeOptions = {
  ...keychainOptions,
  accessControl:
    Keychain.ACCESS_CONTROL?.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE ??
    keychainOptions.accessControl,
};

function parseStoredEntry(password: string): StoredIdentityEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(password);
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

function stringifyStoredEntry(entry: StoredIdentityEntry): string {
  const payload =
    entry.kind === 'unsealed'
      ? entry.bundle
      : entry.didPrefix
        ? {...entry.envelope, didPrefix: entry.didPrefix}
        : entry.envelope;
  return JSON.stringify(payload);
}

async function readStoredEntry(
  options: Parameters<typeof Keychain.getGenericPassword>[0],
): Promise<StoredIdentityEntry | null> {
  let creds: Awaited<ReturnType<typeof Keychain.getGenericPassword>>;
  try {
    creds = await Keychain.getGenericPassword(options);
  } catch (e) {
    throw new KeychainReadError(
      `Failed to read identity from keychain: ${(e as Error)?.message ?? e}`,
      e,
    );
  }
  if (!creds) return null;
  return parseStoredEntry(creds.password);
}

async function saveSealedEnvelopeFallback(entry: StoredIdentityEntry): Promise<void> {
  if (entry.kind !== 'sealed') return;
  await Keychain.setGenericPassword(STORAGE_KEY_V1, stringifyStoredEntry(entry), {
    service: sealedFallbackService,
    accessible: Keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readPrimaryStoredEntry(
  options: Parameters<typeof Keychain.getGenericPassword>[0],
): Promise<StoredIdentityEntry | null> {
  const entry = await readStoredEntry(options);
  if (entry?.kind === 'sealed') {
    await saveSealedEnvelopeFallback(entry);
  }
  return entry;
}

export async function loadStoredEntry(): Promise<StoredIdentityEntry | null> {
  return readPrimaryStoredEntry(keychainOptions);
}

export async function loadStoredEntryWithBiometrics(): Promise<StoredIdentityEntry | null> {
  return readPrimaryStoredEntry(biometricOnlyOptions);
}

export async function loadStoredEntryWithDevicePasscode(): Promise<StoredIdentityEntry | null> {
  return readPrimaryStoredEntry(devicePasscodeOptions);
}

export async function saveStoredEntry(entry: StoredIdentityEntry): Promise<void> {
  await Keychain.setGenericPassword(STORAGE_KEY_V1, stringifyStoredEntry(entry), {
    ...keychainOptions,
  });
}

export async function loadSealedEnvelopeFallback(): Promise<StoredIdentityEntry | null> {
  const entry = await readStoredEntry({
    service: sealedFallbackService,
  });
  return entry?.kind === 'sealed' ? entry : null;
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
  const entry: StoredIdentityEntry = {kind: 'sealed', envelope, didPrefix};
  await saveStoredEntry(entry);
  await saveSealedEnvelopeFallback(entry);
}

export async function clearIdentityBundle(): Promise<void> {
  await Keychain.resetGenericPassword({service: STORAGE_KEY_V1});
  await Keychain.resetGenericPassword({service: sealedFallbackService});
}
