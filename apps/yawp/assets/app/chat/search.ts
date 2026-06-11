import {searchMessages} from '../ash_generated';
import {getValidSessionToken} from '../session';

export type SearchHit = {
  id: string;
  body: string | null;
  senderDid: string;
  serverInsertedAt: string;
  channelId: string;
};

export type SearchResult =
  | {ok: true; hits: SearchHit[]}
  | {ok: false; error: string; message: string};

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function searchServerMessages({
  serverUrl,
  serverId,
  query,
  fetchImpl = fetch,
}: {
  serverUrl: string;
  serverId: string;
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<SearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return {ok: true, hits: []};

  const base = normalizeServerUrl(serverUrl);
  const session = await getValidSessionToken({serverUrl: base, fetchImpl});
  if (!session.ok) {
    return {
      ok: false,
      error: session.reason,
      message:
        session.reason === 'rotation_failed'
          ? 'Your session expired. Re-add the server.'
          : 'Sign in to search this server.',
    };
  }

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return fetchImpl(`${base}${input}`, init);
    }
    return fetchImpl(input as RequestInfo, init);
  };

  const result = await searchMessages({
    input: {serverId, query: trimmed, limit: 20},
    headers: {Authorization: `Bearer ${session.sessionToken}`},
    customFetch,
  });

  if (!result.success) {
    const first = result.errors[0];
    return {
      ok: false,
      error: first?.type ?? 'search_failed',
      message: first?.message ?? 'Search failed. Try again later.',
    };
  }

  return {
    ok: true,
    hits: result.data.map((message: Record<string, any>) => ({
      id: String(message.id),
      body: message.body ?? null,
      senderDid: String(message.senderDid ?? message.sender_did ?? ''),
      serverInsertedAt: String(
        message.serverInsertedAt ?? message.server_inserted_at ?? '',
      ),
      channelId: String(message.channelId ?? message.channel_id ?? ''),
    })),
  };
}
