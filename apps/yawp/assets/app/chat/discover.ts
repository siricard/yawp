
import {listTextChannels} from '../ash_generated';

export type DiscoveredChannel = {
  id: string;
  name: string;
  serverId: string;
};

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function discoverGeneralChannel(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredChannel | null> {
  const base = normalizeServerUrl(serverUrl);

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return fetchImpl(`${base}${input}`, init);
    }
    return fetchImpl(input as RequestInfo, init);
  };

  try {
    const result = await listTextChannels({
      fields: ['id', 'name', 'serverId'],
      customFetch,
    });
    if (!result.success) return null;
    const general = result.data.find(c => c.name === 'general') ?? result.data[0];
    if (!general) return null;
    return {
      id: general.id as string,
      name: general.name as string,
      serverId: general.serverId as string,
    };
  } catch {
    return null;
  }
}
