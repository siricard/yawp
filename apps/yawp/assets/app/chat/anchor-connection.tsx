import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {Channel, Socket} from 'phoenix';

import {useIdentityState} from '../identity-context';
import {anchorReconnectAfterMs, DEGRADED_AFTER_MS} from './anchor-backoff';
import {getSocket} from './socket';

export type AnchorStatus = 'connecting' | 'connected' | 'degraded';

export type AnchorConnection = {
  status: AnchorStatus;
  degraded: boolean;
};

const AnchorContext = createContext<AnchorConnection>({
  status: 'connecting',
  degraded: false,
});

export function useAnchorConnection(
  primaryAnchorUrl: string | null,
  did: string,
): AnchorConnection {
  const [status, setStatus] = useState<AnchorStatus>('connecting');
  const degradedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!primaryAnchorUrl) {
      setStatus('connecting');
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let channel: Channel | null = null;
    const socketRefs: string[] = [];

    function clearDegradedTimer() {
      if (degradedTimer.current !== null) {
        clearTimeout(degradedTimer.current);
        degradedTimer.current = null;
      }
    }

    function armDegradedTimer() {
      if (degradedTimer.current !== null) return;
      degradedTimer.current = setTimeout(() => {
        if (cancelled) return;
        setStatus('degraded');
      }, DEGRADED_AFTER_MS);
    }

    function onDisconnected() {
      if (cancelled) return;
      setStatus(prev => (prev === 'degraded' ? prev : 'connecting'));
      armDegradedTimer();
    }

    (async () => {
      const result = await getSocket(primaryAnchorUrl, {
        reconnectAfterMs: anchorReconnectAfterMs,
      });
      if (cancelled) return;
      if (!result.ok) {
        setStatus('connecting');
        armDegradedTimer();
        return;
      }

      socket = result.socket;
      socketRefs.push(socket.onError(onDisconnected));
      socketRefs.push(socket.onClose(onDisconnected));

      channel = socket.channel(`user:${did}`, {});
      channel.on('presence_state', () => {
        if (cancelled) return;
        clearDegradedTimer();
        setStatus('connected');
      });
      channel.join();
    })();

    return () => {
      cancelled = true;
      clearDegradedTimer();
      if (socket && socketRefs.length > 0) {
        socket.off(socketRefs);
      }
      try {
        channel?.leave();
      } catch {
      }
    };
  }, [primaryAnchorUrl, did]);

  return {status, degraded: status === 'degraded'};
}

export function AnchorConnectionProvider({
  primaryAnchorUrl,
  children,
}: {
  primaryAnchorUrl: string | null;
  children: React.ReactNode;
}) {
  const state = useIdentityState();
  const did = state.status === 'ready' ? state.identity.did : '';
  const connection = useAnchorConnection(
    did ? primaryAnchorUrl : null,
    did,
  );
  return (
    <AnchorContext.Provider value={connection}>
      {children}
    </AnchorContext.Provider>
  );
}

export function useAnchorStatus(): AnchorConnection {
  return useContext(AnchorContext);
}
