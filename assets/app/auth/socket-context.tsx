
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

type SocketState = {
  /** Current authenticated socket if any; null while we have no token. */
  authedSocket: Socket | null;
  /** The stored Phoenix.Token used to connect `authedSocket`. */
  token: string | null;
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

  useEffect(() => {
    let cancelled = false;
    whenSessionTokenLoaded().then(() => {
      if (cancelled) {
        return;
      }
      setToken(getStoredToken());
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
      onAuthenticated: (newToken: string) => {
        setStoredToken(newToken);
        setToken(newToken);
      },
      forgetToken: () => {
        clearStoredToken();
        setToken(null);
      },
    }),
    [authedSocket, token, tokenLoaded],
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
