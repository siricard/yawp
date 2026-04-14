
import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Platform} from 'react-native';

import {b64UrlToBytes, bytesToB64Url, type IdentityBundleV1} from './identity/bundle';
import {generateDeviceSubkey, signWithDevice} from './identity/device';
import {didFromPubkey, fingerprintFromPubkey} from './identity/did';
import {generateMaster, masterPkFromSk, signWithMaster} from './identity/master';
import {loadIdentity, saveIdentity} from './identity/storage-bundle';

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

const WORKSPACES_KEY = 'mook.workspaces';

type State =
  | {status: 'loading'; identity: null; error: null}
  | {status: 'ready'; identity: Identity; error: null}
  | {status: 'error'; identity: null; error: string};

type Ctx = {
  state: State;
  servers: WorkspaceServer[];
  addServer: (server: WorkspaceServer) => void;
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

/**
 * Load the persisted bundle, or generate + persist a fresh one on first run.
 */
export async function loadOrCreateIdentity(): Promise<Identity> {
  const existing = await loadIdentity();
  if (existing) {
    return buildIdentityFromBundle(existing);
  }
  const master = generateMaster();
  const device = generateDeviceSubkey(master.sk);
  const bundle: IdentityBundleV1 = {
    version: 1,
    master: {sk: bytesToB64Url(master.sk)},
    device: {
      deviceId: device.deviceId,
      sk: bytesToB64Url(device.sk),
      pk: bytesToB64Url(device.pk),
      signature: bytesToB64Url(device.signature),
      issuedAt: device.issuedAt,
    },
  };
  await saveIdentity(bundle);
  return buildIdentityFromBundle(bundle);
}

export function IdentityProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<State>({
    status: 'loading',
    identity: null,
    error: null,
  });
  const [servers, setServers] = useState<WorkspaceServer[]>(() => loadServers());

  useEffect(() => {
    let mounted = true;
    loadOrCreateIdentity()
      .then(identity => {
        if (mounted) {
          setState({status: 'ready', identity, error: null});
        }
      })
      .catch(e => {
        if (mounted) {
          setState({
            status: 'error',
            identity: null,
            error: String(e?.message ?? e),
          });
        }
      });
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

  return (
    <IdentityContext.Provider value={{state, servers, addServer}}>
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
