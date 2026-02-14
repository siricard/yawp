
import React, {createContext, useContext, useEffect, useState} from 'react';

import {getOrCreateIdentity, type Identity} from './identity';

type State =
  | {status: 'loading'; identity: null; error: null}
  | {status: 'ready'; identity: Identity; error: null}
  | {status: 'error'; identity: null; error: string};

const IdentityContext = createContext<State | null>(null);

export function IdentityProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<State>({
    status: 'loading',
    identity: null,
    error: null,
  });

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

  return (
    <IdentityContext.Provider value={state}>
      {children}
    </IdentityContext.Provider>
  );
}

/** Returns the loaded identity or throws if still loading / errored. */
export function useIdentity(): Identity {
  const s = useContext(IdentityContext);
  if (!s) {
    throw new Error('useIdentity must be used inside an <IdentityProvider>');
  }
  if (s.status !== 'ready') {
    throw new Error(
      'useIdentity: identity not ready; check useIdentityState() first',
    );
  }
  return s.identity;
}

/** Lower-level hook that exposes the full loading/ready/error state. */
export function useIdentityState(): State {
  const s = useContext(IdentityContext);
  if (!s) {
    throw new Error('useIdentityState must be used inside an <IdentityProvider>');
  }
  return s;
}
