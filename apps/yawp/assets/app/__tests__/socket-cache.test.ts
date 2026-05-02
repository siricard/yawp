/**
 * `getSocket` runs the
 * rotation hop BEFORE any cache lookup and keys the cached Socket by
 * the session token snapshot used to construct it. A rotated token
 * forces the stale Socket to disconnect and a new one to be built;
 * rotation failure drops the cached entry so the next caller starts
 * clean.
 */

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(),
}));

const socketInstances: Array<{
  params: Record<string, unknown> | undefined;
  url: string;
  connect: jest.Mock;
  disconnect: jest.Mock;
}> = [];

jest.mock('phoenix', () => {
  class Socket {
    public params: Record<string, unknown> | undefined;
    public url: string;
    public connect: jest.Mock;
    public disconnect: jest.Mock;
    constructor(url: string, opts?: {params?: Record<string, unknown>}) {
      this.url = url;
      this.params = opts?.params;
      this.connect = jest.fn();
      this.disconnect = jest.fn();
      socketInstances.push(this);
    }
  }
  return {Socket};
});

import {_resetSocketCache, getSocket} from '../chat/socket';
import {getValidSessionToken} from '../session';

const sessionMock = getValidSessionToken as unknown as jest.Mock;

const SERVER = 'http://localhost:4000';

function okSession(tok: string): {ok: true; sessionToken: string} {
  const out = {ok: true as const, sessionToken: ''};
  out.sessionToken = tok;
  return out;
}

describe('getSocket', () => {
  beforeEach(() => {
    sessionMock.mockReset();
    socketInstances.length = 0;
    _resetSocketCache();
    socketInstances.length = 0;
  });

  test('first call → invokes getValidSessionToken and constructs a fresh Socket with the token', async () => {
    const tok = 'tok-A';
    sessionMock.mockResolvedValue(okSession(tok));

    const result = await getSocket(SERVER);

    expect(sessionMock).toHaveBeenCalledTimes(1);
    expect(sessionMock).toHaveBeenCalledWith({serverUrl: SERVER});
    expect(result).toEqual({ok: true, socket: socketInstances[0]});
    expect(socketInstances).toHaveLength(1);
    expect(socketInstances[0].params).toEqual({token: tok});
    expect(socketInstances[0].url).toBe('ws://localhost:4000/socket');
    expect(socketInstances[0].connect).toHaveBeenCalledTimes(1);
  });

  test('second call with the SAME token → returns the cached Socket; no new Socket constructed', async () => {
    sessionMock.mockResolvedValue(okSession('tok-A'));

    const first = await getSocket(SERVER);
    const second = await getSocket(SERVER);

    expect(sessionMock).toHaveBeenCalledTimes(2);
    expect(socketInstances).toHaveLength(1);
    expect(first.ok && second.ok && first.socket === second.socket).toBe(true);
    expect(socketInstances[0].disconnect).not.toHaveBeenCalled();
  });

  test('token rotation between calls → previous Socket disconnected, new Socket built with rotated token', async () => {
    const before = 'tok-A';
    const after = 'tok-B';
    sessionMock.mockResolvedValueOnce(okSession(before));
    sessionMock.mockResolvedValueOnce(okSession(after));

    const first = await getSocket(SERVER);
    const second = await getSocket(SERVER);

    expect(socketInstances).toHaveLength(2);
    expect(first.ok && second.ok && first.socket !== second.socket).toBe(true);
    expect(socketInstances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(socketInstances[1].params).toEqual({token: after});
    expect(socketInstances[1].connect).toHaveBeenCalledTimes(1);
  });

  test('rotation failure → cached entry removed; returns {ok:false, reason:"no_session"}; later success builds a fresh Socket', async () => {
    sessionMock.mockResolvedValueOnce(okSession('tok-A'));
    const seeded = await getSocket(SERVER);
    expect(seeded.ok).toBe(true);
    expect(socketInstances).toHaveLength(1);

    sessionMock.mockResolvedValueOnce({
      ok: false,
      reason: 'rotation_failed',
    });
    const failed = await getSocket(SERVER);
    expect(failed).toEqual({ok: false, reason: 'no_session'});
    expect(socketInstances[0].disconnect).toHaveBeenCalledTimes(1);

    const recoveryTok = 'tok-C';
    sessionMock.mockResolvedValueOnce(okSession(recoveryTok));
    const recovered = await getSocket(SERVER);
    expect(recovered.ok).toBe(true);
    expect(socketInstances).toHaveLength(2);
    expect(socketInstances[1].params).toEqual({token: recoveryTok});
  });
});
