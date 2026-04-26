/**
 * `getValidSessionToken` transparently
 * rotates the stored refresh token via the `rotateRefresh` RPC binding
 * when the stored session is within the 60-second refresh leeway.
 *
 * - Fresh session → returned unchanged, no RPC hop.
 * - Stale session, successful rotation → localStorage row replaced
 * with the new pair, the new session token is returned.
 * - Rotation RPC fails (`refresh_revoked` etc.) → stored row is
 * cleared and `{ok: false, reason: 'rotation_failed'}` returns.
 */

jest.mock('../ash_generated', () => ({
  rotateRefresh: jest.fn(),
}));

import {rotateRefresh} from '../ash_generated';
import {getValidSessionToken} from '../session';
import {clearSession, loadSession, saveSession} from '../session-storage';

const rotateMock = rotateRefresh as unknown as jest.Mock;

const SERVER = 'http://localhost:4000';

describe('getValidSessionToken', () => {
  beforeEach(async () => {
    rotateMock.mockReset();
    await clearSession(SERVER);
  });

  test('no stored session → {ok: false, reason: "no_session"}; no RPC', async () => {
    const result = await getValidSessionToken({serverUrl: SERVER});
    expect(result).toEqual({ok: false, reason: 'no_session'});
    expect(rotateMock).not.toHaveBeenCalled();
  });

  test('fresh stored session (>60s away) → returned unchanged; no RPC', async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await saveSession(SERVER, {
      sessionToken: 'fresh-session',
      refreshToken: 'r',
      expiresAt: future,
    });

    const result = await getValidSessionToken({serverUrl: SERVER});
    expect(result).toEqual({ok: true, sessionToken: 'fresh-session'});
    expect(rotateMock).not.toHaveBeenCalled();
  });

  test('about-to-expire session → rotation hop succeeds; storage updated; new token returned', async () => {
    const stale = new Date(Date.now() + 5_000).toISOString();
    await saveSession(SERVER, {
      sessionToken: 'old-session',
      refreshToken: 'old-refresh',
      expiresAt: stale,
    });

    const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    rotateMock.mockResolvedValue({
      success: true,
      data: {},
      metadata: {
        sessionToken: 'new-session',
        refreshToken: 'new-refresh',
        expiresAt: newExpiresAt,
      },
    });

    const result = await getValidSessionToken({serverUrl: SERVER});
    expect(result).toEqual({ok: true, sessionToken: 'new-session'});

    expect(rotateMock).toHaveBeenCalledTimes(1);
    const call = rotateMock.mock.calls[0][0];
    expect(call.input.token).toBe('old-refresh');

    const stored = await loadSession(SERVER);
    expect(stored).toEqual({
      sessionToken: 'new-session',
      refreshToken: 'new-refresh',
      expiresAt: newExpiresAt,
    });
  });

  test('rotation failure (refresh_revoked) → stored row cleared; {ok:false, rotation_failed}', async () => {
    const stale = new Date(Date.now() + 5_000).toISOString();
    await saveSession(SERVER, {
      sessionToken: 'old-session',
      refreshToken: 'old-refresh',
      expiresAt: stale,
    });

    rotateMock.mockResolvedValue({
      success: false,
      errors: [{type: 'refresh_revoked', message: 'refresh_revoked'}],
    });

    const result = await getValidSessionToken({serverUrl: SERVER});
    expect(result).toEqual({ok: false, reason: 'rotation_failed'});

    const stored = await loadSession(SERVER);
    expect(stored).toBeNull();
  });

  test('network throw during rotation → {ok: false, reason: "rotation_failed"}; row preserved', async () => {
    const stale = new Date(Date.now() + 5_000).toISOString();
    await saveSession(SERVER, {
      sessionToken: 'old-session',
      refreshToken: 'old-refresh',
      expiresAt: stale,
    });

    rotateMock.mockRejectedValue(new Error('boom'));

    const result = await getValidSessionToken({serverUrl: SERVER});
    expect(result).toEqual({ok: false, reason: 'rotation_failed'});

    const stored = await loadSession(SERVER);
    expect(stored?.refreshToken).toBe('old-refresh');
  });
});
