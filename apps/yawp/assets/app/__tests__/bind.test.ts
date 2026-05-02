/**
 * fix3 — `submitBindDevice` passes two distinct timestamps:
 *
 * - `deviceIssuedAt` is `identity.deviceIssuedAt` verbatim (the
 * stable, master-signed device-delegation timestamp).
 * - `requestIssuedAt` is derived from `Date.now` at call time
 * (fresh per-call freshness anchor).
 *
 * Both travel as opaque ISO-8601 strings; the canonical-JSON contract
 * requires the exact same bytes on both ends, so the client MUST NOT
 * reformat (no DateTime parse/format round-trip).
 */

import type {Identity} from '../identity-context';

jest.mock('../ash_generated', () => ({
  bindDevice: jest.fn(),
}));

jest.mock('../session-storage', () => ({
  saveSession: jest.fn().mockResolvedValue(undefined),
}));

import {submitBindDevice} from '../bind';
import {bindDevice} from '../ash_generated';

const bindDeviceMock = bindDevice as unknown as jest.Mock;

function fakeIdentity(): Identity {
  const stubBytes = new Uint8Array(32);
  const stubSig = new Uint8Array(64);
  return {
    did: 'zZZZZZZ',
    didFull: 'did:yawp:zZZZZZZ',
    masterPk: stubBytes,
    deviceId: 'fake-device-id',
    devicePk: stubBytes,
    deviceDelegationSignature: stubSig,
    deviceIssuedAt: '2026-05-25T20:34:12.967Z',
    fingerprint: 'yp:0000 · 0000 · 0000 · 0000',
    sign: () => stubSig,
    signDevice: () => stubSig,
  };
}

describe('submitBindDevice — split issued_at', () => {
  beforeEach(() => {
    bindDeviceMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('sends identity.deviceIssuedAt verbatim into input.deviceIssuedAt', async () => {
    bindDeviceMock.mockResolvedValue({
      success: true,
      data: {id: 'x', did: 'did:yawp:zZZZZZZ', profileVersion: 1},
      metadata: {
        sessionToken: 's',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });

    const identity = fakeIdentity();
    const result = await submitBindDevice({
      serverUrl: 'http://localhost:4000',
      identity,
    });

    expect(result.ok).toBe(true);
    expect(bindDeviceMock).toHaveBeenCalledTimes(1);
    const call = bindDeviceMock.mock.calls[0][0];
    expect(call.input.deviceIssuedAt).toBe('2026-05-25T20:34:12.967Z');
    expect(call.input.deviceIssuedAt).toMatch(/\.\d{3}Z$/);
  });

  test('derives input.requestIssuedAt from Date.now() at call time, NOT from identity.deviceIssuedAt', async () => {
    bindDeviceMock.mockResolvedValue({
      success: true,
      data: {id: 'x', did: 'did:yawp:zZZZZZZ', profileVersion: 1},
      metadata: {
        sessionToken: 's',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });

    jest.useFakeTimers({doNotFake: ['setImmediate', 'setTimeout']});
    const now = new Date('2099-06-15T12:34:56.789Z');
    jest.setSystemTime(now);

    const identity = fakeIdentity();
    const result = await submitBindDevice({
      serverUrl: 'http://localhost:4000',
      identity,
    });

    expect(result.ok).toBe(true);
    const call = bindDeviceMock.mock.calls[0][0];
    expect(call.input.requestIssuedAt).toBe('2099-06-15T12:34:56.789Z');
    expect(call.input.requestIssuedAt).not.toBe(identity.deviceIssuedAt);
  });
});
