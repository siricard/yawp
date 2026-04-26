/**
 * fix2 — `submitBindDevice` passes `identity.deviceIssuedAt`
 * verbatim into the RPC `input.issuedAt` field. The canonical-JSON
 * contract requires the exact same bytes on both ends, so the client
 * MUST NOT reformat (no DateTime parse/format round-trip).
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

describe('submitBindDevice — issued_at opacity', () => {
  beforeEach(() => {
    bindDeviceMock.mockReset();
  });

  test('sends identity.deviceIssuedAt verbatim into input.issuedAt', async () => {
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
    expect(call.input.issuedAt).toBe('2026-05-25T20:34:12.967Z');
    expect(call.input.issuedAt).toMatch(/\.\d{3}Z$/);
  });
});
