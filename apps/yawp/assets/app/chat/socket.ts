
import {Socket, type SocketConnectOption} from 'phoenix';

import {getValidSessionToken} from '../session';
import {normalizeAnchorServerUrl} from './anchor-url';

type CacheEntry = {socket: Socket; token: string};

const sockets = new Map<string, CacheEntry>();

function normalize(url: string): string {
  return normalizeAnchorServerUrl(url) ?? url.trim().replace(/\/+$/, '');
}

function wsUrl(serverUrl: string): string {
  const base = normalize(serverUrl);
  const wsBase = base.replace(/^http/i, 'ws');
  return `${wsBase}/socket`;
}

function dropCachedSocket(base: string): void {
  const existing = sockets.get(base);
  if (!existing) return;
  try {
    existing.socket.disconnect();
  } catch {
  }
  sockets.delete(base);
}

export type GetSocketResult =
  | {ok: true; socket: Socket}
  | {ok: false; reason: 'no_session'};

export async function getSocket(
  serverUrl: string,
  opts: Partial<SocketConnectOption> = {},
): Promise<GetSocketResult> {
  const base = normalize(serverUrl);

  const session = await getValidSessionToken({serverUrl: base});
  if (!session.ok) {
    dropCachedSocket(base);
    return {ok: false, reason: 'no_session'};
  }

  const existing = sockets.get(base);
  if (existing && existing.token === session.sessionToken) {
    return {ok: true, socket: existing.socket};
  }

  if (existing) {
    try {
      existing.socket.disconnect();
    } catch {
    }
    sockets.delete(base);
  }

  const socket = new Socket(wsUrl(base), {
    params: {token: session.sessionToken},
    ...opts,
  });
  socket.connect();
  sockets.set(base, {socket, token: session.sessionToken});
  return {ok: true, socket};
}

export function _resetSocketCache(): void {
  for (const base of Array.from(sockets.keys())) {
    dropCachedSocket(base);
  }
}
