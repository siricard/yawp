
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {Socket} from './phoenix-socket';
import {SOCKET_URL} from './socket-url';
import {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  whenSessionTokenLoaded,
} from './session-token';

export type TokenStatus =
  | 'unchecked'
  | 'validating'
  | 'valid'
  | 'invalid'
  | 'none';

type SocketState = {
  /** Current authenticated socket if any; null while we have no token. */
  authedSocket: Socket | null;
  /** The stored Phoenix.Token used to connect `authedSocket`. */
  token: string | null;
  /**
   * Result of the server-side `whoami` probe over `authedSocket`. Tracks
   * whether the token we presented actually unlocked the socket — a
   * silent fallback to anonymous on `UserSocket.connect/3` is otherwise
   * indistinguishable from a real auth.
   */
  tokenStatus: TokenStatus;
  /**
   * Called by the AuthChannel handshake on success. Persists the token
   * and (re)builds an authenticated socket so room:* joins succeed.
   */
  onAuthenticated: (token: string) => void;
  /** Forget the token; downstream sockets are torn down. */
  forgetToken: () => void;
  /** True once we have finished the initial async token load. */
  tokenLoaded: boolean;
};

const SocketContext = createContext<SocketState | null>(null);

export function SocketProvider({children}: {children: React.ReactNode}) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('unchecked');

  useEffect(() => {
    let cancelled = false;
    whenSessionTokenLoaded().then(() => {
      if (cancelled) {
        return;
      }
      const initial = getStoredToken();
      setToken(initial);
      setTokenStatus(initial ? 'unchecked' : 'none');
      setTokenLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const authedSocket = useMemo<Socket | null>(() => {
    if (!token) {
      return null;
    }
    const s = new Socket(SOCKET_URL, {params: {token}});
    s.connect();
    return s;
  }, [token]);

  useEffect(() => {
    if (!authedSocket || !token) {
      return;
    }
    let cancelled = false;
    setTokenStatus('validating');
    const channel = authedSocket.channel('whoami', {});
    channel
      .join()
      .receive('ok', () => {
        if (cancelled) {
          return;
        }
        setTokenStatus('valid');
        try {
          channel.leave();
        } catch {
                  }
      })
      .receive('error', () => {
        if (cancelled) {
          return;
        }
        clearStoredToken();
        setTokenStatus('invalid');
        setToken(null);
        try {
          channel.leave();
        } catch {
                  }
      })
      .receive('timeout', () => {
        if (cancelled) {
          return;
        }
        setTokenStatus('invalid');
      });
    return () => {
      cancelled = true;
      try {
        channel.leave();
      } catch {
              }
    };
  }, [authedSocket, token]);

  useEffect(() => {
    return () => {
      if (authedSocket) {
        try {
          authedSocket.disconnect();
        } catch {
                  }
      }
    };
  }, [authedSocket]);

  const value = useMemo<SocketState>(
    () => ({
      authedSocket,
      token,
      tokenLoaded,
      tokenStatus,
      onAuthenticated: (newToken: string) => {
        setStoredToken(newToken);
        setTokenStatus('valid');
        setToken(newToken);
      },
      forgetToken: () => {
        clearStoredToken();
        setTokenStatus('none');
        setToken(null);
      },
    }),
    [authedSocket, token, tokenLoaded, tokenStatus],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocketState(): SocketState {
  const v = useContext(SocketContext);
  if (!v) {
    throw new Error('useSocketState must be used inside <SocketProvider>');
  }
  return v;
}
