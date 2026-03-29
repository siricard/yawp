
import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Platform} from 'react-native';

import {getOrCreateIdentity, type Identity} from './identity';

export type WorkspaceServer = {
  /** Origin/base URL the client uses, e.g. `http://localhost:4000`. */
  url: string;
  /** DID returned by the server claim (or any subsequent join). */
  did: string;
  /** Role granted on this server (Owner/Admin/Member). */
  role: string;
  /** Display name; for we just reuse the URL's host. */
  label: string;
};

const WORKSPACES_KEY = 'yawp.workspaces.v1';

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
  if (Platform.OS !== 'web') {
    return [];
  }
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

export function IdentityProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<State>({
    status: 'loading',
    identity: null,
    error: null,
  });
  const [servers, setServers] = useState<WorkspaceServer[]>(() => loadServers());

  useEffect(() => {
    let mounted = true;
    getOrCreateIdentity()
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

/** Returns the loaded identity or throws if still loading / errored. */
export function useIdentity(): Identity {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentity must be used inside an <IdentityProvider>');
  }
  if (ctx.state.status !== 'ready') {
    throw new Error(
      'useIdentity: identity not ready; check useIdentityState() first',
    );
  }
  return ctx.state.identity;
}

/** Lower-level hook that exposes the full loading/ready/error state. */
export function useIdentityState(): State {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentityState must be used inside an <IdentityProvider>');
  }
  return ctx.state;
}

/** Hook for the user's workspace-bar server list. */
export function useWorkspaceServers(): {
  servers: WorkspaceServer[];
  addServer: (server: WorkspaceServer) => void;
} {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error(
      'useWorkspaceServers must be used inside an <IdentityProvider>',
    );
  }
  return {servers: ctx.servers, addServer: ctx.addServer};
}
