
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

export async function loadStoredEntry(): Promise<StoredIdentityEntry | null> {
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
    service: STORAGE_KEY_V1,
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
