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

export type InboxEvent = {
  envelope_id: string;
  envelope: Record<string, unknown>;
  is_request: boolean;
  inbox_serial: number;
};

const AnchorContext = createContext<AnchorConnection>({
  status: 'connecting',
  degraded: false,
});

export function useAnchorConnection(
  anchorUrls: string[],
  did: string,
  guestAnchors: string[] = [],
  onInbox?: (event: InboxEvent) => void,
): AnchorConnection {
  const [status, setStatus] = useState<AnchorStatus>('connecting');
  const degradedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorsKey = anchorUrls.join('|');
  const guestAnchorsKey = guestAnchors.join('|');

  useEffect(() => {
    if (anchorUrls.length === 0 || !did) {
      setStatus('connecting');
      return;
    }

    let cancelled = false;
    const reachable = new Map<string, boolean>();
    anchorUrls.forEach(url => reachable.set(url, false));
    const cleanups: Array<() => void> = [];

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

    function recompute() {
      if (cancelled) return;
      const anyReachable = Array.from(reachable.values()).some(Boolean);
      if (anyReachable) {
        clearDegradedTimer();
        setStatus('connected');
      } else {
        setStatus(prev => (prev === 'degraded' ? prev : 'connecting'));
        armDegradedTimer();
      }
    }

    anchorUrls.forEach(url => {
      (async () => {
        const result = await getSocket(url, {
          reconnectAfterMs: anchorReconnectAfterMs,
        });
        if (cancelled) return;
        if (!result.ok) {
          reachable.set(url, false);
          recompute();
          return;
        }

        const socket: Socket = result.socket;
        const socketRefs: string[] = [];
        function markUnreachable() {
          if (cancelled) return;
          reachable.set(url, false);
          recompute();
        }
        socketRefs.push(socket.onError(markUnreachable));
        socketRefs.push(socket.onClose(markUnreachable));

        const channel: Channel = socket.channel(`user:${did}`, {
          guest_anchors: guestAnchors,
        });
        channel.on('presence_state', () => {
          if (cancelled) return;
          reachable.set(url, true);
          recompute();
        });
        channel.on('inbox', payload => {
          if (cancelled || !isInboxEvent(payload)) return;
          onInbox?.(payload);
        });
        channel.join();

        cleanups.push(() => {
          if (socketRefs.length > 0) socket.off(socketRefs);
          try {
            channel.leave();
          } catch {
          }
        });
      })();
    });

    armDegradedTimer();

    return () => {
      cancelled = true;
      clearDegradedTimer();
      cleanups.forEach(fn => fn());
    };
  }, [anchorsKey, did, guestAnchorsKey, onInbox]);

  return {status, degraded: status === 'degraded'};
}

export function AnchorConnectionProvider({
  anchorUrls,
  guestAnchors = [],
  onInbox,
  children,
}: {
  anchorUrls: string[];
  guestAnchors?: string[];
  onInbox?: (event: InboxEvent) => void;
  children: React.ReactNode;
}) {
  const state = useIdentityState();
  const did = state.status === 'ready' ? state.identity.did : '';
  const connection = useAnchorConnection(
    did ? anchorUrls : [],
    did,
    guestAnchors,
    onInbox,
  );
  return (
    <AnchorContext.Provider value={connection}>
      {children}
    </AnchorContext.Provider>
  );
}

function isInboxEvent(payload: unknown): payload is InboxEvent {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<InboxEvent>;
  return (
    typeof candidate.envelope_id === 'string' &&
    typeof candidate.envelope === 'object' &&
    candidate.envelope !== null &&
    typeof candidate.is_request === 'boolean' &&
    typeof candidate.inbox_serial === 'number'
  );
}

export function useAnchorStatus(): AnchorConnection {
  return useContext(AnchorContext);
}
