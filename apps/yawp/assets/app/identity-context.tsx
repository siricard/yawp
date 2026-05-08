
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
  UnsealError,
  sealBundle,
  unsealBundle,
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
const DISPLAY_NAME_KEY = 'yawp.identity.display_name';

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
  | {status: 'ready'; identity: Identity; sealed: boolean; error: null}
  | {status: 'error'; identity: null; error: string};

type Ctx = {
  state: State;
  servers: WorkspaceServer[];
  addServer: (server: WorkspaceServer) => void;
  displayName: string | null;
  setDisplayName: (name: string) => void;
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

function loadDisplayName(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    return window.localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

function persistDisplayName(name: string): void {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
  }
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
  const [displayName, setDisplayNameState] = useState<string | null>(() =>
    loadDisplayName(),
  );
  const draftRef = useRef<DraftIdentity | null>(null);
  const draftSealedRef = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const entry = await loadStoredEntry();
        if (!mounted) return;
        if (entry && entry.kind === 'sealed') {
          setState({
            status: 'locked',
            sealedEnvelope: entry.envelope,
            identity: null,
            error: null,
          });
          return;
        }
        if (entry && entry.kind === 'unsealed') {
          setState({
            status: 'ready',
            identity: buildIdentityFromBundle(entry.bundle),
            sealed: false,
            error: null,
          });
          return;
        }
        const draft = generateDraftIdentity();
        draftRef.current = draft;
        setState({
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
        setState({status: 'error', identity: null, error: msg});
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

  const setDisplayName = useCallback((name: string) => {
    persistDisplayName(name);
    setDisplayNameState(name);
  }, []);

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
      if (passphrase && passphrase.length > 0) {
        const envelope = sealBundle(bundle, passphrase);
        await saveSealedEnvelope(envelope);
        draftSealedRef.current = true;
      } else {
        await saveIdentity(bundle);
        draftSealedRef.current = false;
      }
      if (chosenName !== null) {
        persistDisplayName(chosenName);
        setDisplayNameState(chosenName);
      }
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
      setState({
        status: 'ready',
        identity: buildIdentityFromDraft(draft),
        sealed: false,
        error: null,
      });
      return {ok: true};
    },
    [],
  );

  const finishOnboarding = useCallback(() => {
    const draft = draftRef.current;
    if (!draft) return;
    setState({
      status: 'ready',
      identity: buildIdentityFromDraft(draft),
      sealed: draftSealedRef.current,
      error: null,
    });
  }, []);

  const unlock = useCallback(
    async (passphrase: string): Promise<UnlockResult> => {
      let envelope: SealedEnvelopeV2 | null = null;
      setState(prev => {
        if (prev.status === 'locked') envelope = prev.sealedEnvelope;
        return prev;
      });
      if (!envelope) return {ok: false, reason: 'unknown'};
      try {
        const bundle = unsealBundle(envelope, passphrase);
        setState({
          status: 'ready',
          identity: buildIdentityFromBundle(bundle),
          sealed: true,
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
    [],
  );

  const changePassphrase = useCallback(
    async ({
      current,
      next,
    }: {
      current: string | null;
      next: string | null;
    }): Promise<ChangePassphraseResult> => {
      const entry = await loadStoredEntry();
      if (!entry) return {ok: false, reason: 'unknown'};
      let bundle: IdentityBundleV1;
      if (entry.kind === 'sealed') {
        if (current === null) return {ok: false, reason: 'wrong_passphrase'};
        try {
          bundle = unsealBundle(entry.envelope, current);
        } catch (e) {
          if (e instanceof UnsealError && e.reason === 'wrong_passphrase') {
            return {ok: false, reason: 'wrong_passphrase'};
          }
          return {ok: false, reason: 'unknown'};
        }
      } else {
        bundle = entry.bundle;
      }
      try {
        if (next && next.length > 0) {
          const envelope = sealBundle(bundle, next);
          await saveSealedEnvelope(envelope);
          setState(prev =>
            prev.status === 'ready'
              ? {...prev, sealed: true}
              : prev,
          );
        } else {
          await saveIdentity(bundle);
          setState(prev =>
            prev.status === 'ready'
              ? {...prev, sealed: false}
              : prev,
          );
        }
        return {ok: true};
      } catch {
        return {ok: false, reason: 'unknown'};
      }
    },
    [],
  );

  return (
    <IdentityContext.Provider
      value={{
        state,
        servers,
        addServer,
        displayName,
        setDisplayName,
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

export function useDisplayName(): {
  /**
   * The user's chosen override, if any. `null` when no override is set
   * callers that want the rendered name should use `effectiveDisplayName`
   * instead, which falls back to the word-pair default.
   */
  displayName: string | null;
  setDisplayName: (name: string) => void;
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
    setDisplayName: ctx.setDisplayName,
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
