
import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {Platform} from 'react-native';

import {entropyToMnemonic, mnemonicToSeed, validateMnemonic} from './identity/bip39';
import {b64UrlToBytes, bytesToB64Url, type IdentityBundleV1} from './identity/bundle';
import {generateDeviceSubkey, signWithDevice} from './identity/device';
import {didFromPubkey, fingerprintFromPubkey} from './identity/did';
import {masterFromMnemonicSeed, masterPkFromSk, signWithMaster} from './identity/master';
import {
  loadIdentity,
  loadStoredEntry,
  saveIdentity,
  saveSealedEnvelope,
} from './identity/storage-bundle';
import {
  SEAL_SALT_BYTES,
  UnsealError,
  deriveSealKey,
  sealBundleWithKey,
  unsealEnvelope,
  type SealedEnvelopeV2,
} from './identity/seal';
import {defaultDisplayName} from './identity/word-pair';

export type Identity = {
  /**
   * Bare base58 form, preserved for back-compat (claim.ts /
   * AddServerScreen / DidScreen all prefix `did:yawp:` themselves).
   */
  did: string;
  /** Full `did:yawp:<base58>` form. */
  didFull: string;
  /** Long-lived master public key (32-byte Ed25519). */
  masterPk: Uint8Array;
  /** Per-device unique id (UUID v4). */
  deviceId: string;
  /** Device subkey's public key. */
  devicePk: Uint8Array;
  /** Master-signed delegation over `{device_id, pk, issued_at}`. */
  deviceDelegationSignature: Uint8Array;
  /** ISO 8601 timestamp of device subkey issuance. */
  deviceIssuedAt: string;
  /** short fingerprint of the master key, e.g. `yp:8f3a · …`. */
  fingerprint: string;
  /** Sign bytes with the master secret key. */
  sign: (bytes: Uint8Array) => Uint8Array;
  /** Sign bytes with the device subkey's secret key. */
  signDevice: (bytes: Uint8Array) => Uint8Array;
};

export type WorkspaceServer = {
  url: string;
  did: string;
  role: string;
  label: string;
};

/**
 * In-flight identity material during the onboarding ceremony. NOT persisted
 * to disk until `completeOnboarding()` is called.
 */
export type DraftIdentity = {
  /** 12-word BIP-39 mnemonic shown to the user. */
  mnemonic: string[];
  /** Master keypair derived from the mnemonic seed. */
  masterSk: Uint8Array;
  masterPk: Uint8Array;
  /** Device subkey generated in the same step. */
  deviceId: string;
  deviceSk: Uint8Array;
  devicePk: Uint8Array;
  deviceDelegationSignature: Uint8Array;
  deviceIssuedAt: string;
};

export type OnboardingStep =
  | 'choose_path'
  | 'restore'
  | 'mnemonic'
  | 'passphrase'
  | 'display_name'
  | 'complete';

/**
 * outcome of a recovery attempt. `ok: false` cases mirror the
 * BIP-39 `validateMnemonic` reasons plus `wrong_word_count` so callers can
 * display a precise error.
 */
export type RestoreResult =
  | {ok: true}
  | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'};

const WORKSPACES_KEY = 'mook.workspaces';

/**
 * outcome of an unlock attempt against a sealed envelope.
 */
export type UnlockResult =
  | {ok: true}
  | {ok: false; reason: 'wrong_passphrase' | 'tampered' | 'unknown'};

/**
 * outcome of changing (or setting / removing) the at-rest
 * passphrase. `current` is the existing passphrase if the bundle is
 * already sealed; pass `null` if the bundle is currently unsealed.
 * `next` is the new passphrase; pass `null` to leave (or transition to)
 * the unsealed state.
 */
export type ChangePassphraseResult =
  | {ok: true}
  | {ok: false; reason: 'wrong_passphrase' | 'invalid' | 'unknown'};

type State =
  | {status: 'loading'; identity: null; error: null}
  | {
      status: 'onboarding';
      step: OnboardingStep;
      draftIdentity: DraftIdentity;
      identity: null;
      error: null;
    }
  | {
      status: 'locked';
      /** Pinned at load time; used by `unlock()` and `changePassphrase()`. */
      sealedEnvelope: SealedEnvelopeV2;
      identity: null;
      error: null;
    }
  | {
      status: 'ready';
      identity: Identity;
      sealed: boolean;
      /**
       * the in-memory unlocked bundle. Always present
       * when `status === 'ready'`. Mutations to identity-scoped metadata
       * (display name, nudge) go through this in-memory bundle via
       * `mutateBundleMetadata`, which then re-persists (sealed or
       * unsealed) without losing the seal.
       */
      unlockedBundle: IdentityBundleV1;
      /**
       * Cached 32-byte HKDF-derived seal key. Present iff `sealed: true`.
       * Captured at unlock / set-passphrase time so re-seals after
       * metadata writes skip PBKDF2. Wiped when the seal is removed.
       */
      sealKey: Uint8Array | null;
      /** Salt that pairs with `sealKey`. Same lifetime as `sealKey`. */
      sealSalt: Uint8Array | null;
      error: null;
    }
  | {status: 'error'; identity: null; error: string};

type Ctx = {
  state: State;
  servers: WorkspaceServer[];
  addServer: (server: WorkspaceServer) => void;
  /**
   * User-chosen display-name override read from the persisted identity
   * bundle's `metadata.displayNameOverride`. `null` when no override is
   * set; callers that want the rendered name should use the
   * `useDisplayName()` helper which falls back to the word-pair default.
   */
  displayName: string | null;
  /**
   * set/clear the override inside the identity bundle. Pass
   * `null` to remove the override (the word-pair default takes over).
   * Mutates `metadata.displayNameOverride` and re-persists the bundle.
   */
  setDisplayNameOverride: (name: string | null) => Promise<void>;
  /**
   * single entry point for any identity-scoped metadata
   * mutation (display-name override, nudge state, future identity-bundle
   * additions). Reads the in-memory unlocked bundle, applies `mut`, and
   * re-persists — re-sealing under the cached key when the identity is
   * sealed, or writing the raw bundle when it isn't. Throws when
   * `state.status !== 'ready'`.
   */
  mutateBundleMetadata: (
    mut: (
      prev: NonNullable<IdentityBundleV1['metadata']>,
    ) => NonNullable<IdentityBundleV1['metadata']>,
  ) => Promise<IdentityBundleV1>;
  /**
   * read-only view of the live in-memory bundle metadata.
   * Consumers (e.g. `useNudgeStore`) snapshot this on render to derive
   * UI state without re-reading from disk.
   */
  bundleMetadata: NonNullable<IdentityBundleV1['metadata']>;
  /** Advance to the next onboarding step (or to 'ready' if completing). */
  advanceOnboarding: (next: OnboardingStep) => void;
  /**
   * Persist the draft identity to disk and advance to the 'complete' step
   * (still inside 'onboarding'). The Identity is not yet active — call
   * `finishOnboarding` after the user dismisses the landing tile.
   * The passphrase is accepted for future sealing ignores
   * it at the storage layer.
   */
  completeOnboarding: (opts: {
    passphrase: string | null;
    /**
     * User-chosen override. `null` means "keep the deterministic word-pair
     * default" — no override is persisted.
     */
    displayName: string | null;
  }) => Promise<void>;
  /** Transition from 'onboarding/complete' to 'ready'. */
  finishOnboarding: () => void;
  /**
   * restore an identity from a 12-word BIP-39 mnemonic. On success,
   * the derived master keypair REPLACES the in-memory draft, a fresh device
   * subkey is generated, the bundle is persisted, and the provider
   * transitions directly to 'ready'. No network calls are made.
   */
  restoreFromMnemonic: (words: string[]) => Promise<RestoreResult>;
  /**
   * unlock a sealed envelope. Only valid in `status === 'locked'`.
   * On success transitions to `status === 'ready'` with `sealed: true`.
   */
  unlock: (passphrase: string) => Promise<UnlockResult>;
  /**
   * set, change, or remove the at-rest passphrase. Re-seals the
   * current identity under `next` (or persists it unsealed if `next` is
   * `null`). `current` MUST match the existing passphrase if the bundle
   * is currently sealed; pass `null` if it isn't.
   */
  changePassphrase: (opts: {
    current: string | null;
    next: string | null;
  }) => Promise<ChangePassphraseResult>;
};

const IdentityContext = createContext<Ctx | null>(null);

const EMPTY_METADATA: NonNullable<IdentityBundleV1['metadata']> = Object.freeze(
  {},
) as NonNullable<IdentityBundleV1['metadata']>;

function loadServers(): WorkspaceServer[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is WorkspaceServer =>
        s &&
        typeof s.url === 'string' &&
        typeof s.did === 'string' &&
        typeof s.role === 'string' &&
        typeof s.label === 'string',
    );
  } catch {
    return [];
  }
}

function persistServers(servers: WorkspaceServer[]): void {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(servers));
  } catch {
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function randomSaltBytes(): Uint8Array {
  const out = new Uint8Array(SEAL_SALT_BYTES);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function buildIdentityFromBundle(bundle: IdentityBundleV1): Identity {
  const masterSk = b64UrlToBytes(bundle.master.sk);
  const masterPk = masterPkFromSk(masterSk);
  const deviceSk = b64UrlToBytes(bundle.device.sk);
  const devicePk = b64UrlToBytes(bundle.device.pk);
  const deviceDelegationSignature = b64UrlToBytes(bundle.device.signature);
  const didFull = didFromPubkey(masterPk);
  const didBase58 = didFull.replace(/^did:yawp:/, '');
  return {
    did: didBase58,
    didFull,
    masterPk,
    deviceId: bundle.device.deviceId,
    devicePk,
    deviceDelegationSignature,
    deviceIssuedAt: bundle.device.issuedAt,
    fingerprint: fingerprintFromPubkey(masterPk),
    sign: bytes => signWithMaster(masterSk, bytes),
    signDevice: bytes => signWithDevice(deviceSk, bytes),
  };
}

function buildIdentityFromDraft(draft: DraftIdentity): Identity {
  const didFull = didFromPubkey(draft.masterPk);
  const didBase58 = didFull.replace(/^did:yawp:/, '');
  return {
    did: didBase58,
    didFull,
    masterPk: draft.masterPk,
    deviceId: draft.deviceId,
    devicePk: draft.devicePk,
    deviceDelegationSignature: draft.deviceDelegationSignature,
    deviceIssuedAt: draft.deviceIssuedAt,
    fingerprint: fingerprintFromPubkey(draft.masterPk),
    sign: bytes => signWithMaster(draft.masterSk, bytes),
    signDevice: bytes => signWithDevice(draft.deviceSk, bytes),
  };
}

/**
 * Generate a fresh BIP-39 12-word mnemonic + derived master + device subkey,
 * entirely in memory. **Not persisted.** Used to seed onboarding.
 */
export function generateDraftIdentity(): DraftIdentity {
  const entropy = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(entropy);
  } else {
    for (let i = 0; i < entropy.length; i++) {
      entropy[i] = Math.floor(Math.random() * 256);
    }
  }
  const mnemonic = entropyToMnemonic(entropy);
  const seed = mnemonicToSeed(mnemonic);
  const master = masterFromMnemonicSeed(seed);
  const device = generateDeviceSubkey(master.sk);
  return {
    mnemonic,
    masterSk: master.sk,
    masterPk: master.pk,
    deviceId: device.deviceId,
    deviceSk: device.sk,
    devicePk: device.pk,
    deviceDelegationSignature: device.signature,
    deviceIssuedAt: device.issuedAt,
  };
}

export function IdentityProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<State>({
    status: 'loading',
    identity: null,
    error: null,
  });
  const [servers, setServers] = useState<WorkspaceServer[]>(() => loadServers());
  const [displayName, setDisplayNameState] = useState<string | null>(null);
  const draftRef = useRef<DraftIdentity | null>(null);
  const draftSealedRef = useRef<boolean>(false);
  const draftSealRef = useRef<{
    sealKey: Uint8Array;
    salt: Uint8Array;
  } | null>(null);
  const stateRef = useRef<State>({
    status: 'loading',
    identity: null,
    error: null,
  });
  const applyState = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const entry = await loadStoredEntry();
        if (!mounted) return;
        if (entry && entry.kind === 'sealed') {
          applyState({
            status: 'locked',
            sealedEnvelope: entry.envelope,
            identity: null,
            error: null,
          });
          return;
        }
        if (entry && entry.kind === 'unsealed') {
          setDisplayNameState(
            entry.bundle.metadata?.displayNameOverride ?? null,
          );
          applyState({
            status: 'ready',
            identity: buildIdentityFromBundle(entry.bundle),
            sealed: false,
            unlockedBundle: entry.bundle,
            sealKey: null,
            sealSalt: null,
            error: null,
          });
          return;
        }
        const draft = generateDraftIdentity();
        draftRef.current = draft;
        applyState({
          status: 'onboarding',
          step: 'choose_path',
          draftIdentity: draft,
          identity: null,
          error: null,
        });
      } catch (e: unknown) {
        if (!mounted) return;
        const msg =
          e && typeof e === 'object' && 'message' in e
            ? String((e as {message: unknown}).message)
            : String(e);
        applyState({status: 'error', identity: null, error: msg});
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const addServer = useCallback((server: WorkspaceServer) => {
    setServers(prev => {
      const without = prev.filter(s => s.url !== server.url);
      const next = [...without, server];
      persistServers(next);
      return next;
    });
  }, []);

  /**
   * single entry point for identity-scoped metadata
   * mutations. Reads the in-memory unlocked bundle out of `stateRef`,
   * applies `mut` to compute the next metadata map (we always pass a
   * concrete object; the mutator returns the new one), and re-persists.
   *
   * Sealed identities are re-sealed under the cached `sealKey + salt`
   * (no PBKDF2 — the user already paid that cost at unlock / set-
   * passphrase time). Unsealed identities are written raw.
   *
   * Returns the new bundle so callers (display-name, nudge) can update
   * their local state synchronously after the write.
   */
  const mutateBundleMetadata = useCallback(
    async (
      mut: (
        prev: NonNullable<IdentityBundleV1['metadata']>,
      ) => NonNullable<IdentityBundleV1['metadata']>,
    ): Promise<IdentityBundleV1> => {
      const current = stateRef.current;
      if (current.status !== 'ready') {
        throw new Error('mutateBundleMetadata: identity is not ready');
      }
      const prevMeta = current.unlockedBundle.metadata ?? {};
      const nextMeta = mut(prevMeta);
      const hasKeys = Object.keys(nextMeta).length > 0;
      let nextBundle: IdentityBundleV1;
      if (hasKeys) {
        nextBundle = {...current.unlockedBundle, metadata: nextMeta};
      } else {
        const {metadata: _omit, ...rest} = current.unlockedBundle;
        nextBundle = rest as IdentityBundleV1;
      }
      if (current.sealed) {
        if (!current.sealKey || !current.sealSalt) {
          throw new Error(
            'mutateBundleMetadata: sealed identity is missing its cached seal key',
          );
        }
        const envelope = sealBundleWithKey(
          nextBundle,
          current.sealKey,
          current.sealSalt,
        );
        await saveSealedEnvelope(envelope);
      } else {
        await saveIdentity(nextBundle);
      }
      applyState({...current, unlockedBundle: nextBundle});
      return nextBundle;
    },
    [applyState],
  );

  const setDisplayNameOverride = useCallback(
    async (name: string | null): Promise<void> => {
      const trimmed = name === null ? null : name.trim();
      await mutateBundleMetadata(prev => {
        const next = {...prev};
        if (trimmed && trimmed.length > 0) {
          next.displayNameOverride = trimmed;
        } else {
          delete next.displayNameOverride;
        }
        return next;
      });
      setDisplayNameState(trimmed && trimmed.length > 0 ? trimmed : null);
    },
    [mutateBundleMetadata],
  );

  const advanceOnboarding = useCallback((next: OnboardingStep) => {
    setState(prev => {
      if (prev.status !== 'onboarding') return prev;
      return {...prev, step: next};
    });
  }, []);

  const completeOnboarding = useCallback(
    async ({
      passphrase,
      displayName: chosenName,
    }: {
      passphrase: string | null;
      displayName: string | null;
    }) => {
      const draft = draftRef.current;
      if (!draft) {
        throw new Error('completeOnboarding called outside onboarding flow');
      }
      const trimmedName =
        chosenName !== null && chosenName.trim().length > 0
          ? chosenName.trim()
          : null;
      const bundle: IdentityBundleV1 = {
        version: 1,
        master: {sk: bytesToB64Url(draft.masterSk)},
        device: {
          deviceId: draft.deviceId,
          sk: bytesToB64Url(draft.deviceSk),
          pk: bytesToB64Url(draft.devicePk),
          signature: bytesToB64Url(draft.deviceDelegationSignature),
          issuedAt: draft.deviceIssuedAt,
        },
        ...(trimmedName ? {metadata: {displayNameOverride: trimmedName}} : {}),
      };
      if (passphrase && passphrase.length > 0) {
        const salt = randomSaltBytes();
        const sealKey = deriveSealKey(passphrase, salt);
        const envelope = sealBundleWithKey(bundle, sealKey, salt);
        await saveSealedEnvelope(envelope);
        draftSealedRef.current = true;
        draftSealRef.current = {sealKey, salt};
      } else {
        await saveIdentity(bundle);
        draftSealedRef.current = false;
        draftSealRef.current = null;
      }
      setDisplayNameState(trimmedName);
      setState(prev => {
        if (prev.status !== 'onboarding') return prev;
        return {...prev, step: 'complete'};
      });
    },
    [],
  );

  const restoreFromMnemonic = useCallback(
    async (words: string[]): Promise<RestoreResult> => {
      if (words.length !== 12) {
        return {ok: false, reason: 'wrong_word_count'};
      }
      const validation = validateMnemonic(words);
      if (!validation.ok) {
        if (validation.reason === 'invalid_word_count') {
          return {ok: false, reason: 'wrong_word_count'};
        }
        return {ok: false, reason: validation.reason};
      }
      const seed = mnemonicToSeed(words);
      const master = masterFromMnemonicSeed(seed);
      const device = generateDeviceSubkey(master.sk);
      const draft: DraftIdentity = {
        mnemonic: words,
        masterSk: master.sk,
        masterPk: master.pk,
        deviceId: device.deviceId,
        deviceSk: device.sk,
        devicePk: device.pk,
        deviceDelegationSignature: device.signature,
        deviceIssuedAt: device.issuedAt,
      };
      const bundle: IdentityBundleV1 = {
        version: 1,
        master: {sk: bytesToB64Url(draft.masterSk)},
        device: {
          deviceId: draft.deviceId,
          sk: bytesToB64Url(draft.deviceSk),
          pk: bytesToB64Url(draft.devicePk),
          signature: bytesToB64Url(draft.deviceDelegationSignature),
          issuedAt: draft.deviceIssuedAt,
        },
      };
      await saveIdentity(bundle);
      draftRef.current = draft;
      setDisplayNameState(null);
      draftSealedRef.current = false;
      draftSealRef.current = null;
      applyState({
        status: 'ready',
        identity: buildIdentityFromDraft(draft),
        sealed: false,
        unlockedBundle: bundle,
        sealKey: null,
        sealSalt: null,
        error: null,
      });
      return {ok: true};
    },
    [applyState],
  );

  const finishOnboarding = useCallback(() => {
    const draft = draftRef.current;
    if (!draft) return;
    const cached = draftSealRef.current;
    const unlockedBundle: IdentityBundleV1 = {
      version: 1,
      master: {sk: bytesToB64Url(draft.masterSk)},
      device: {
        deviceId: draft.deviceId,
        sk: bytesToB64Url(draft.deviceSk),
        pk: bytesToB64Url(draft.devicePk),
        signature: bytesToB64Url(draft.deviceDelegationSignature),
        issuedAt: draft.deviceIssuedAt,
      },
      ...(displayName ? {metadata: {displayNameOverride: displayName}} : {}),
    };
    applyState({
      status: 'ready',
      identity: buildIdentityFromDraft(draft),
      sealed: draftSealedRef.current,
      unlockedBundle,
      sealKey: cached?.sealKey ?? null,
      sealSalt: cached?.salt ?? null,
      error: null,
    });
  }, [applyState, displayName]);

  const unlock = useCallback(
    async (passphrase: string): Promise<UnlockResult> => {
      const current = stateRef.current;
      if (current.status !== 'locked') return {ok: false, reason: 'unknown'};
      const envelope = current.sealedEnvelope;
      try {
        const {bundle, sealKey, salt} = unsealEnvelope(envelope, passphrase);
        setDisplayNameState(bundle.metadata?.displayNameOverride ?? null);
        applyState({
          status: 'ready',
          identity: buildIdentityFromBundle(bundle),
          sealed: true,
          unlockedBundle: bundle,
          sealKey,
          sealSalt: salt,
          error: null,
        });
        return {ok: true};
      } catch (e) {
        if (e instanceof UnsealError) {
          if (e.reason === 'wrong_passphrase') {
            return {ok: false, reason: 'wrong_passphrase'};
          }
          if (e.reason === 'tampered') {
            return {ok: false, reason: 'tampered'};
          }
        }
        return {ok: false, reason: 'unknown'};
      }
    },
    [applyState],
  );

  const changePassphrase = useCallback(
    async ({
      current,
      next,
    }: {
      current: string | null;
      next: string | null;
    }): Promise<ChangePassphraseResult> => {
      const currentState = stateRef.current;
      if (currentState.status !== 'ready') {
        return {ok: false, reason: 'unknown'};
      }
      if (currentState.sealed) {
        if (current === null) return {ok: false, reason: 'wrong_passphrase'};
        if (!currentState.sealSalt) return {ok: false, reason: 'unknown'};
        const candidate = deriveSealKey(current, currentState.sealSalt);
        const cached = currentState.sealKey;
        if (!cached || !constantTimeEqual(candidate, cached)) {
          return {ok: false, reason: 'wrong_passphrase'};
        }
      }
      const bundle = currentState.unlockedBundle;
      try {
        if (next && next.length > 0) {
          const salt = randomSaltBytes();
          const sealKey = deriveSealKey(next, salt);
          const envelope = sealBundleWithKey(bundle, sealKey, salt);
          await saveSealedEnvelope(envelope);
          applyState({
            ...currentState,
            sealed: true,
            sealKey,
            sealSalt: salt,
          });
        } else {
          await saveIdentity(bundle);
          applyState({
            ...currentState,
            sealed: false,
            sealKey: null,
            sealSalt: null,
          });
        }
        return {ok: true};
      } catch {
        return {ok: false, reason: 'unknown'};
      }
    },
    [applyState],
  );

  return (
    <IdentityContext.Provider
      value={{
        state,
        servers,
        addServer,
        displayName,
        setDisplayNameOverride,
        mutateBundleMetadata,
        bundleMetadata:
          state.status === 'ready'
            ? state.unlockedBundle.metadata ?? EMPTY_METADATA
            : EMPTY_METADATA,
        advanceOnboarding,
        completeOnboarding,
        finishOnboarding,
        restoreFromMnemonic,
        unlock,
        changePassphrase,
      }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): Identity {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentity must be used inside an <IdentityProvider>');
  }
  if (ctx.state.status !== 'ready') {
    throw new Error('useIdentity: identity not ready; check useIdentityState() first');
  }
  return ctx.state.identity;
}

export function useIdentityState(): State {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentityState must be used inside an <IdentityProvider>');
  }
  return ctx.state;
}

export function useWorkspaceServers(): {
  servers: WorkspaceServer[];
  addServer: (server: WorkspaceServer) => void;
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useWorkspaceServers must be used inside an <IdentityProvider>');
  }
  return {servers: ctx.servers, addServer: ctx.addServer};
}

/**
 * Onboarding handle used by the OnboardingFlow screen. Returns undefined
 * outside an `<IdentityProvider>` to keep tests that don't wrap simple.
 */
export function useOnboarding(): {
  advance: (next: OnboardingStep) => void;
  complete: (opts: {
    passphrase: string | null;
    displayName: string | null;
  }) => Promise<void>;
  finish: () => void;
  restore: (words: string[]) => Promise<RestoreResult>;
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside an <IdentityProvider>');
  }
  return {
    advance: ctx.advanceOnboarding,
    complete: ctx.completeOnboarding,
    finish: ctx.finishOnboarding,
    restore: ctx.restoreFromMnemonic,
  };
}

/**
 * accessor for the passphrase-related actions.
 *
 * - `sealed`: whether the currently-loaded bundle is at-rest sealed.
 * `false` when status is anything other than `ready`.
 * - `unlock`: only meaningful when status === 'locked'.
 * - `changePassphrase`: meaningful when status === 'ready'.
 */
export function usePassphrase(): {
  sealed: boolean;
  unlock: (passphrase: string) => Promise<UnlockResult>;
  changePassphrase: (opts: {
    current: string | null;
    next: string | null;
  }) => Promise<ChangePassphraseResult>;
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('usePassphrase must be used inside an <IdentityProvider>');
  }
  const sealed =
    ctx.state.status === 'ready'
      ? ctx.state.sealed
      : ctx.state.status === 'locked';
  return {
    sealed,
    unlock: ctx.unlock,
    changePassphrase: ctx.changePassphrase,
  };
}

/**
 * accessor for the live identity-bundle metadata + the
 * `mutateBundleMetadata` writer. Used by `useSecondAnchorNudge` (and any
 * future identity-scoped metadata consumer) so that mutations go through
 * the in-memory unlocked bundle + re-seal path instead of touching
 * storage directly.
 *
 * The returned `metadata` reference is the same object that lives inside
 * the unlocked bundle; treat it as read-only.
 */
export function useBundleMetadata(): {
  metadata: NonNullable<IdentityBundleV1['metadata']>;
  ready: boolean;
  mutate: Ctx['mutateBundleMetadata'];
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useBundleMetadata must be used inside an <IdentityProvider>');
  }
  return {
    metadata: ctx.bundleMetadata,
    ready: ctx.state.status === 'ready',
    mutate: ctx.mutateBundleMetadata,
  };
}

export function useDisplayName(): {
  /**
   * The user's chosen override, if any. `null` when no override is set
   * callers that want the rendered name should use `effectiveDisplayName`
   * instead, which falls back to the word-pair default.
   */
  displayName: string | null;
  /**
   * set or clear the override inside the identity bundle.
   * Pass `null` to remove the override; the word-pair default takes over.
   */
  setDisplayNameOverride: (name: string | null) => Promise<void>;
  /**
   * the override if set, otherwise the deterministic word-pair
   * default derived from the master public key. Returns `null` only when
   * the identity is not yet ready (loading / onboarding / error).
   */
  effectiveDisplayName: string | null;
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useDisplayName must be used inside an <IdentityProvider>');
  }
  let effective: string | null = null;
  if (ctx.displayName && ctx.displayName.trim().length > 0) {
    effective = ctx.displayName;
  } else if (ctx.state.status === 'ready') {
    effective = defaultDisplayName(ctx.state.identity.masterPk);
  }
  return {
    displayName: ctx.displayName,
    setDisplayNameOverride: ctx.setDisplayNameOverride,
    effectiveDisplayName: effective,
  };
}

/**
 * Legacy entry point used by `apps/yawp/assets/app/identity/index.ts` and
 * older call sites. Performs the silent auto-generate-and-persist path
 * with NO onboarding ceremony. New UI code must go through the
 * `IdentityProvider` instead.
 */
export async function loadOrCreateIdentity(): Promise<Identity> {
  const existing = await loadIdentity();
  if (existing) {
    return buildIdentityFromBundle(existing);
  }
  const draft = generateDraftIdentity();
  const bundle: IdentityBundleV1 = {
    version: 1,
    master: {sk: bytesToB64Url(draft.masterSk)},
    device: {
      deviceId: draft.deviceId,
      sk: bytesToB64Url(draft.deviceSk),
      pk: bytesToB64Url(draft.devicePk),
      signature: bytesToB64Url(draft.deviceDelegationSignature),
      issuedAt: draft.deviceIssuedAt,
    },
  };
  await saveIdentity(bundle);
  return buildIdentityFromDraft(draft);
}
