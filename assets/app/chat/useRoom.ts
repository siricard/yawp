
import {useCallback, useEffect, useRef, useState} from 'react';

import type {Socket, Channel} from '../auth';
import {useSocketState} from '../auth';

export type RoomMessage = {
  id: string;
  roomId: string;
  senderDid: string;
  content: string;
  insertedAt: string;
};

export type RoomStatus =
  | {status: 'idle'}
  | {status: 'joining'}
  | {status: 'joined'}
  | {status: 'error'; reason: string};

function shapeServerMessage(v: unknown): RoomMessage | null {
  if (typeof v !== 'object' || v === null) {
    return null;
  }
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.room_id !== 'string' ||
    typeof o.sender_did !== 'string' ||
    typeof o.content !== 'string'
  ) {
    return null;
  }
  return {
    id: o.id,
    roomId: o.room_id,
    senderDid: o.sender_did,
    content: o.content,
    insertedAt:
      typeof o.inserted_at === 'string'
        ? o.inserted_at
        : new Date().toISOString(),
  };
}

function insertSorted(
  messages: RoomMessage[],
  msg: RoomMessage,
): RoomMessage[] {
  if (messages.some(m => m.id === msg.id)) {
    return messages;
  }
  const out = [...messages, msg];
  out.sort((a, b) => (a.insertedAt < b.insertedAt ? -1 : 1));
  return out;
}

export function useRoom(roomId: string | null): {
  status: RoomStatus;
  messages: RoomMessage[];
  sendMessage: (content: string) => Promise<{ok: true} | {ok: false; reason: string}>;
  /** True if the socket isn't authenticated (no token / unauth user). */
  unauthenticated: boolean;
} {
  const {authedSocket, tokenLoaded, token} = useSocketState();
  const [status, setStatus] = useState<RoomStatus>({status: 'idle'});
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    if (!tokenLoaded) {
      return;
    }
    if (!authedSocket) {
      setStatus({status: 'error', reason: 'unauthenticated'});
      return;
    }

    setStatus({status: 'joining'});
    setMessages([]);

    const socket: Socket = authedSocket;
    const channel = socket.channel(`room:${roomId}`, {});
    channelRef.current = channel;

    channel.on('new_message', (payload: unknown) => {
      const msg = shapeServerMessage(payload);
      if (!msg) {
        return;
      }
      setMessages(prev => insertSorted(prev, msg));
    });

    channel
      .join()
      .receive('ok', () => {
        setStatus({status: 'joined'});
      })
      .receive('error', (resp: unknown) => {
        const reason =
          typeof resp === 'object' &&
          resp !== null &&
          typeof (resp as {reason?: unknown}).reason === 'string'
            ? (resp as {reason: string}).reason
            : 'join_failed';
        setStatus({status: 'error', reason});
      })
      .receive('timeout', () => {
        setStatus({status: 'error', reason: 'join_timeout'});
      });

    return () => {
      try {
        channel.leave();
      } catch {
              }
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [roomId, authedSocket, tokenLoaded]);

  const sendMessage = useCallback(
    async (
      content: string,
    ): Promise<{ok: true} | {ok: false; reason: string}> => {
      const channel = channelRef.current;
      if (!channel) {
        return {ok: false, reason: 'not_joined'};
      }
      const trimmed = content.trim();
      if (!trimmed) {
        return {ok: false, reason: 'empty'};
      }
      return new Promise(resolve => {
        channel
          .push('send_message', {content: trimmed})
          .receive('ok', () => resolve({ok: true}))
          .receive('error', (resp: unknown) => {
            const reason =
              typeof resp === 'object' &&
              resp !== null &&
              typeof (resp as {reason?: unknown}).reason === 'string'
                ? (resp as {reason: string}).reason
                : 'send_failed';
            resolve({ok: false, reason});
          })
          .receive('timeout', () =>
            resolve({ok: false, reason: 'send_timeout'}),
          );
      });
    },
    [],
  );

  return {
    status,
    messages,
    sendMessage,
    unauthenticated: tokenLoaded && !token,
  };
}
