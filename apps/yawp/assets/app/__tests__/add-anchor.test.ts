/**
 * `submitAddAnchor` registers a second anchor host with the user's
 * primary anchor. It resolves a Bearer token for the primary anchor,
 * normalizes the new host (strips scheme/trailing slash), and calls
 * the generated `addAnchor` RPC binding with the target identity.
 */

import type {Identity} from '../identity-context';

jest.mock('../ash_generated', () => ({
  addAnchor: jest.fn(),
}));

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(),
}));

import {submitAddAnchor} from '../add-anchor';
import {addAnchor} from '../ash_generated';
import {getValidSessionToken} from '../session';

const addAnchorMock = addAnchor as unknown as jest.Mock;
const getSessionMock = getValidSessionToken as unknown as jest.Mock;

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

describe('submitAddAnchor', () => {
  beforeEach(() => {
    addAnchorMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ok: true, sessionToken: 'sess-token'});
  });

  test('sends the new anchor host and target DID to the primary anchor', async () => {
    addAnchorMock.mockResolvedValue({
      success: true,
      data: {
        id: 'x',
        did: 'did:yawp:zZZZZZZ',
        anchorList: ['http://localhost:4000', 'anchor-b.example'],
        profileVersion: 2,
      },
    });

    const result = await submitAddAnchor({
      primaryAnchorUrl: 'http://localhost:4000',
      newAnchorHost: 'anchor-b.example',
      identity: fakeIdentity(),
    });

    expect(result.ok).toBe(true);
    expect(addAnchorMock).toHaveBeenCalledTimes(1);
    const call = addAnchorMock.mock.calls[0][0];
    expect(call.identity).toEqual({did: 'did:yawp:zZZZZZZ'});
    expect(call.input.newAnchor).toBe('anchor-b.example');
    expect(call.headers).toEqual({Authorization: 'Bearer sess-token'});
    if (result.ok) {
      expect(result.anchorList).toContain('anchor-b.example');
    }
  });

  test('strips a scheme and trailing slash from the new anchor host', async () => {
    addAnchorMock.mockResolvedValue({
      success: true,
      data: {id: 'x', did: 'did:yawp:zZZZZZZ', anchorList: [], profileVersion: 2},
    });

    await submitAddAnchor({
      primaryAnchorUrl: 'http://localhost:4000',
      newAnchorHost: 'https://anchor-b.example/',
      identity: fakeIdentity(),
    });

    const call = addAnchorMock.mock.calls[0][0];
    expect(call.input.newAnchor).toBe('anchor-b.example');
  });

  test('rejects a blank host without calling the RPC', async () => {
    const result = await submitAddAnchor({
      primaryAnchorUrl: 'http://localhost:4000',
      newAnchorHost: '   ',
      identity: fakeIdentity(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_anchor');
    expect(addAnchorMock).not.toHaveBeenCalled();
  });

  test('surfaces a no-session failure when the primary anchor has no token', async () => {
    getSessionMock.mockResolvedValue({ok: false, reason: 'no_session'});

    const result = await submitAddAnchor({
      primaryAnchorUrl: 'http://localhost:4000',
      newAnchorHost: 'anchor-b.example',
      identity: fakeIdentity(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_session');
    expect(addAnchorMock).not.toHaveBeenCalled();
  });

  test('maps an unauthorized RPC error to a friendly message', async () => {
    addAnchorMock.mockResolvedValue({
      success: false,
      errors: [{type: 'unauthorized', message: 'unauthorized'}],
    });

    const result = await submitAddAnchor({
      primaryAnchorUrl: 'http://localhost:4000',
      newAnchorHost: 'anchor-b.example',
      identity: fakeIdentity(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unauthorized');
  });
});
