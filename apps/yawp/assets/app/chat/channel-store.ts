
import {useEffect, useRef, useState} from 'react';
import type {Channel, Socket} from 'phoenix';

import {useIdentity} from '../identity-context';
import {getSocket} from './socket';
import {signDelete, signEdit, signSend} from './sign-message';

export type ChannelMessage = {
  id: string;
  channel_id: string;
  /**
   * Bare base58 DID (i.e. `did:yawp:<base58>` with the `did:yawp:`
   * prefix stripped on the wire). Matches every other use of
   * `identity.did` — the client prefixes `did:yawp:` for display.
   */
  sender_did: string;
  body: string | null;
  reply_to_message_id: string | null;
  mentions: string[];
  attachments: Record<string, unknown>[];
  signed_by: string;
  signature: string;
  server_serial: number;
  server_inserted_at: string;
  edited?: boolean;
};

type MessageEdited = {
  message_id: string;
  body: string;
  edit_serial: number;
};

type MessageDeleted = {
  message_id: string;
  reason: string;
};

export type UseChannelStatus = 'connecting' | 'joined' | 'error' | 'removed';

type MemberRemoved = {
  did: string;
  reason: string;
};

export type UseChannelResult = {
  status: UseChannelStatus;
  errorMessage: string | null;
  removedReason: string | null;
  messages: ChannelMessage[];
  effectiveBits: number;
  send: (body: string, replyToMessageId?: string | null) => void;
  edit: (messageId: string, body: string) => void;
  remove: (messageId: string) => void;
};

function sortBySerial(list: ChannelMessage[]): ChannelMessage[] {
  return [...list].sort((a, b) => a.server_serial - b.server_serial);
}

export function useChannel(
  serverUrl: string | null,
  serverId: string | null,
  channelId: string | null,
): UseChannelResult {
  const identity = useIdentity();
  const [status, setStatus] = useState<UseChannelStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removedReason, setRemovedReason] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [effectiveBits, setEffectiveBits] = useState(0);
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!serverUrl || !serverId || !channelId) {
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
      localChannel = localSocket.channel(
        `server:${serverId}:channel:${channelId}`,
        {},
      );
      channelRef.current = localChannel;

      localChannel.on('history', (payload: {messages: ChannelMessage[]}) => {
        if (cancelled) return;
        setMessages(sortBySerial(payload?.messages ?? []));
      });

      localChannel.on('new_message', (msg: ChannelMessage) => {
        if (cancelled) return;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return sortBySerial([...prev, msg]);
        });
      });

      localChannel.on('message_edited', (edit: MessageEdited) => {
        if (cancelled) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === edit.message_id
              ? {...m, body: edit.body, edited: true}
              : m,
          ),
        );
      });

      localChannel.on('message_deleted', (del: MessageDeleted) => {
        if (cancelled) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === del.message_id ? {...m, body: null} : m,
          ),
        );
      });

      localChannel.on('removed', (payload: MemberRemoved) => {
        if (cancelled) return;
        setStatus('removed');
        setRemovedReason(payload?.reason ?? 'removed');
      });

      localChannel
        .join()
        .receive('ok', (resp: {effective_bits?: number} | undefined) => {
          if (cancelled) return;
          setStatus('joined');
          setErrorMessage(null);
          setEffectiveBits(
            typeof resp?.effective_bits === 'number' ? resp.effective_bits : 0,
          );
        })
        .receive('error', (resp: {reason?: string} | undefined) => {
          if (cancelled) return;
          setStatus('error');
          setEffectiveBits(0);
          setErrorMessage(
            typeof resp?.reason === 'string'
              ? resp.reason
              : 'Could not join the channel.',
          );
        })
        .receive('timeout', () => {
          if (cancelled) return;
          setStatus('error');
          setEffectiveBits(0);
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
  }, [serverUrl, serverId, channelId]);

  function send(body: string, replyToMessageId: string | null = null): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    const channel = channelRef.current;
    if (!channel || !channelId) return;
    const ts = Date.now();
    const signature = signSend(
      {
        channel_id: channelId,
        sender_did: identity.didFull,
        body: trimmed,
        reply_to_message_id: replyToMessageId,
        mentions: [],
        attachments: [],
        ts,
      },
      identity.signDevice,
    );
    channel.push('send_message', {
      body: trimmed,
      reply_to_message_id: replyToMessageId,
      signed_by: identity.deviceId,
      signature,
      ts,
    });
  }

  function edit(messageId: string, body: string): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    const channel = channelRef.current;
    if (!channel) return;
    const ts = Date.now();
    const signature = signEdit(
      {message_id: messageId, body: trimmed, ts},
      identity.signDevice,
    );
    channel.push('edit_message', {
      message_id: messageId,
      body: trimmed,
      signed_by: identity.deviceId,
      signature,
      ts,
    });
  }

  function remove(messageId: string): void {
    const channel = channelRef.current;
    if (!channel) return;
    const ts = Date.now();
    const signature = signDelete(
      {
        message_id: messageId,
        reason: 'sender',
        actor_did: identity.didFull,
        ts,
      },
      identity.signDevice,
    );
    channel.push('delete_message', {
      message_id: messageId,
      reason: 'sender',
      signed_by: identity.deviceId,
      signature,
      ts,
    });
  }

  return {
    status,
    errorMessage,
    removedReason,
    messages,
    effectiveBits,
    send,
    edit,
    remove,
  };
}
