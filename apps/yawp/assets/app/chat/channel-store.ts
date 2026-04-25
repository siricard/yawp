
import {useEffect, useRef, useState} from 'react';
import type {Channel, Socket} from 'phoenix';

import {useIdentity} from '../identity-context';
import {getSocket} from './socket';
import {signMessage} from './sign-message';

export type ChannelMessage = {
  id: string;
  channel_id: string;
  /**
   * Bare base58 DID (i.e. `did:yawp:<base58>` with the `did:yawp:`
   * prefix stripped on the wire). Matches every other use of
   * `identity.did` — the client prefixes `did:yawp:` for display.
   */
  author_did: string;
  body: string;
  signed_by: string;
  signature: string;
  server_inserted_at: string;
};

export type UseChannelStatus = 'connecting' | 'joined' | 'error';

export type UseChannelResult = {
  status: UseChannelStatus;
  errorMessage: string | null;
  messages: ChannelMessage[];
  send: (body: string) => void;
};

export function useChannel(
  serverUrl: string | null,
  channelId: string | null,
): UseChannelResult {
  const identity = useIdentity();
  const [status, setStatus] = useState<UseChannelStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!serverUrl || !channelId) {
      return;
    }
    let cancelled = false;
    let localSocket: Socket | null = null;
    let localChannel: Channel | null = null;

    (async () => {
      const result = await getSocket(serverUrl);
      if (cancelled) return;
      if (!result.ok) {
        setStatus('error');
        setErrorMessage(
          'No active session on this anchor. Re-add the server to continue.',
        );
        return;
      }
      localSocket = result.socket;
      localChannel = localSocket.channel(`channel:${channelId}`, {});
      channelRef.current = localChannel;

      localChannel.on('history', (payload: {messages: ChannelMessage[]}) => {
        if (cancelled) return;
        setMessages(payload?.messages ?? []);
      });

      localChannel.on('new_message', (msg: ChannelMessage) => {
        if (cancelled) return;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg].sort((a, b) =>
            a.server_inserted_at < b.server_inserted_at
              ? -1
              : a.server_inserted_at > b.server_inserted_at
                ? 1
                : 0,
          );
        });
      });

      localChannel
        .join()
        .receive('ok', () => {
          if (cancelled) return;
          setStatus('joined');
          setErrorMessage(null);
        })
        .receive('error', resp => {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage(
            typeof resp?.reason === 'string'
              ? resp.reason
              : 'Could not join the channel.',
          );
        })
        .receive('timeout', () => {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage('Joining the channel timed out.');
        });
    })();

    return () => {
      cancelled = true;
      try {
        localChannel?.leave();
      } catch {
      }
      channelRef.current = null;
    };
  }, [serverUrl, channelId]);

  function send(body: string): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    const channel = channelRef.current;
    if (!channel) return;
    const ts = Date.now();
    const signature = signMessage(
      {channel_id: channelId!, body: trimmed, ts},
      identity.signDevice,
    );
    channel.push('send', {
      body: trimmed,
      signature,
      signed_by: identity.deviceId,
      ts,
    });
  }

  return {status, errorMessage, messages, send};
}
