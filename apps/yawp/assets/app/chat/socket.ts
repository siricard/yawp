
import {Socket, type SocketConnectOption} from 'phoenix';

import {loadSession} from '../session-storage';

const sockets = new Map<string, Socket>();

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function wsUrl(serverUrl: string): string {
  const base = normalize(serverUrl);
  const wsBase = base.replace(/^http/i, 'ws');
  return `${wsBase}/socket`;
}

export type GetSocketResult =
  | {ok: true; socket: Socket}
  | {ok: false; reason: 'no_session'};

export async function getSocket(
  serverUrl: string,
  opts: Partial<SocketConnectOption> = {},
): Promise<GetSocketResult> {
  const base = normalize(serverUrl);
  const existing = sockets.get(base);
  if (existing) {
    return {ok: true, socket: existing};
  }

  const session = await loadSession(base);
  if (!session) {
    return {ok: false, reason: 'no_session'};
  }

  const socket = new Socket(wsUrl(base), {
    params: {token: session.sessionToken},
    ...opts,
  });
  socket.connect();
  sockets.set(base, socket);
  return {ok: true, socket};
}

/** Test-only: drop the cached socket for `serverUrl`. */
export function _resetSocketCache(): void {
  for (const sock of sockets.values()) {
    try {
      sock.disconnect();
    } catch {
    }
  }
  sockets.clear();
}
