import {searchServerMessages} from '../chat/search';
import {getValidSessionToken} from '../session';

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(),
}));

const sessionMock = getValidSessionToken as jest.Mock;

describe('message search', () => {
  beforeEach(() => {
    sessionMock.mockResolvedValue({ok: true, sessionToken: 'session-token'});
  });

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

    const result = await searchServerMessages({
      serverUrl: 'http://server.test/',
      serverId: 'server-1',
      query: 'narwhal',
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://server.test/rpc/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
        body: expect.stringContaining('"action":"search_messages"'),
      }),
    );
    if (result.ok) {
      expect(result.hits).toEqual([
        {
          id: 'm1',
          body: 'private narwhal briefing',
          senderDid: 'did:yawp:alice',
          serverInsertedAt: '2026-01-01T00:00:00Z',
          channelId: 'c1',
        },
      ]);
    }
  });

  it('returns an auth error without issuing search when no session is available', async () => {
    sessionMock.mockResolvedValue({ok: false, reason: 'no_session'});
    const fetchImpl = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

    const result = await searchServerMessages({
      serverUrl: 'http://server.test/',
      serverId: 'server-1',
      query: 'narwhal',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      error: 'no_session',
      message: 'Sign in to search this server.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
