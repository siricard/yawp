import {probeServerInfo} from '../onboarding/useServerInfoProbe';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('probeServerInfo', () => {
  test('returns claimed=true info on a valid claimed response', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({claimed: true, serverName: 'Yawp', fingerprint: 'ab12:cd34'}),
    ) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000', fetchImpl);

    expect(result).toEqual({
      ok: true,
      info: {claimed: true, serverName: 'Yawp', fingerprint: 'ab12:cd34'},
    });
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe(
      'http://localhost:4000/.well-known/yawp/server-info',
    );
  });

  test('returns claimed=false info on a valid unclaimed response', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({claimed: false, serverName: 'Yawp', fingerprint: null}),
    ) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000/', fetchImpl);
    expect(result).toEqual({
      ok: true,
      info: {claimed: false, serverName: 'Yawp', fingerprint: null},
    });
  });

  test('strips trailing slashes from the base URL', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({claimed: false}),
    ) as unknown as typeof fetch;

    await probeServerInfo('http://localhost:4000///', fetchImpl);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe(
      'http://localhost:4000/.well-known/yawp/server-info',
    );
  });

  test('reports an error for a non-200 response', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({}, 503),
    ) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/HTTP 503/);
    }
  });

  test('reports an error for a malformed body (missing claimed)', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({serverName: 'Yawp'}),
    ) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/valid response/i);
    }
  });

  test('reports an error when fetch rejects (network failure)', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/could not reach/i);
    }
  });

  test('reports a timeout error when the request is aborted', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;

    const result = await probeServerInfo('http://localhost:4000', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/timed out/i);
    }
  });

  test('returns an error for an empty server URL', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await probeServerInfo('   ', fetchImpl);
    expect(result.ok).toBe(false);
    expect((fetchImpl as jest.Mock).mock.calls.length).toBe(0);
  });
});
