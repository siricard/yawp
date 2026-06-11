import {searchServerMessages} from '../chat/search';

describe('message search', () => {
  it('posts search RPC to the selected server and normalizes hits', async () => {
    const fetchImpl = jest.fn(async (_input, _init) => ({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'm1',
            body: 'private narwhal briefing',
            senderDid: 'did:yawp:alice',
            serverInsertedAt: '2026-01-01T00:00:00Z',
            channelId: 'c1',
          },
        ],
      }),
    })) as unknown as jest.MockedFunction<typeof fetch>;

    const hits = await searchServerMessages({
      serverUrl: 'http://server.test/',
      serverId: 'server-1',
      query: 'narwhal',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://server.test/rpc/run',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"search_messages"'),
      }),
    );
    expect(hits).toEqual([
      {
        id: 'm1',
        body: 'private narwhal briefing',
        senderDid: 'did:yawp:alice',
        serverInsertedAt: '2026-01-01T00:00:00Z',
        channelId: 'c1',
      },
    ]);
  });
});
