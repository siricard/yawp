import {useEffect, useRef, useState} from 'react';
import type {Channel, Socket} from 'phoenix';

import {getSocket} from './socket';

export type UseServerUnreadResult = {
  unreadByChannel: Record<string, number>;
  total: number;
};

export function useServerUnread(args: {
  serverUrl: string | null;
  serverId: string | null;
  channelIds: string[];
  activeChannelId: string | null;
}): UseServerUnreadResult {
  const {serverUrl, serverId, channelIds, activeChannelId} = args;
  const [unreadByChannel, setUnreadByChannel] = useState<
    Record<string, number>
  >({});
  const activeRef = useRef<string | null>(activeChannelId);
  activeRef.current = activeChannelId;

  const watchedIds = channelIds.filter(id => id !== activeChannelId);
  const channelKey = watchedIds.join(',');

  useEffect(() => {
    setUnreadByChannel(prev => {
      if (activeChannelId && prev[activeChannelId]) {
        return {...prev, [activeChannelId]: 0};
      }
      return prev;
    });
  }, [activeChannelId]);

  useEffect(() => {
    if (!serverUrl || !serverId || watchedIds.length === 0) {
      return;
    }
    let cancelled = false;
    let localSocket: Socket | null = null;
    const joined: Channel[] = [];

    (async () => {
      const result = await getSocket(serverUrl);
      if (cancelled || !result.ok) return;
      localSocket = result.socket;

      for (const channelId of watchedIds) {
        const chan = localSocket.channel(
          `server:${serverId}:channel:${channelId}`,
          {mode: 'watch'},
        );
        chan.on('new_message', () => {
          if (cancelled) return;
          if (activeRef.current === channelId) return;
          setUnreadByChannel(prev => ({
            ...prev,
            [channelId]: (prev[channelId] ?? 0) + 1,
          }));
        });
        chan.on('read_marker', () => {
          if (cancelled) return;
          setUnreadByChannel(prev =>
            prev[channelId] ? {...prev, [channelId]: 0} : prev,
          );
        });
        chan.join();
        joined.push(chan);
      }
    })();

    return () => {
      cancelled = true;
      for (const chan of joined) {
        try {
          chan.leave();
        } catch {
        }
      }
    };
  }, [serverUrl, serverId, channelKey]);

  const total = Object.entries(unreadByChannel).reduce(
    (acc, [id, count]) => (id === activeChannelId ? acc : acc + count),
    0,
  );

  return {unreadByChannel, total};
}
