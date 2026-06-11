import {searchMessages} from '../ash_generated';

export type SearchHit = {
  id: string;
  body: string | null;
  senderDid: string;
  serverInsertedAt: string;
  channelId: string;
};

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
}): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const base = normalizeServerUrl(serverUrl);
  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return fetchImpl(`${base}${input}`, init);
    }
    return fetchImpl(input as RequestInfo, init);
  };

  const result = await searchMessages({
    input: {serverId, query: trimmed, limit: 20},
    customFetch,
  });

  if (!result.success) return [];

  return result.data.map((message: Record<string, any>) => ({
    id: String(message.id),
    body: message.body ?? null,
    senderDid: String(message.senderDid ?? message.sender_did ?? ''),
    serverInsertedAt: String(
      message.serverInsertedAt ?? message.server_inserted_at ?? '',
    ),
    channelId: String(message.channelId ?? message.channel_id ?? ''),
  }));
}
