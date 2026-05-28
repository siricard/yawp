/**
 * auto-bind on server-tile click.
 *
 * Verifies the lazy-bind behavior wired into App.tsx's
 * `handleSelectServer`:
 *
 * 1. Tile click with NO stored session → exactly one `submitBindDevice`
 * call; on success, `discoverGeneralChannel` runs once and the
 * channel screen mounts.
 * 2. Tile click WITH a stored session whose `expiresAt > now + 30s` →
 * `submitBindDevice` is NOT called; `discoverGeneralChannel` runs
 * once.
 * 3. Tile click with NO stored session and a bind failure
 * (`identity_not_found`) → `discoverGeneralChannel` is NOT called
 * and the home body renders `bind-error-banner` with the humanized
 * message + a "Re-add server" CTA.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {Identity, WorkspaceServer} from '../identity-context';

const SERVER: WorkspaceServer = {
  url: 'http://localhost:4000',
  did: 'did:yawp:zZZZZZZ',
  role: 'Owner',
  label: 'localhost:4000',
};

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
    deviceIssuedAt: '2026-01-01T00:00:00.000Z',
    fingerprint: 'yp:0000 · 0000 · 0000 · 0000',
    sign: () => stubSig,
    signDevice: () => stubSig,
  };
}

jest.mock('../identity-context', () => ({
  IdentityProvider: ({children}: {children: unknown}) => children,
  useIdentityState: jest.fn(),
  useWorkspaceServers: jest.fn(),
  useDisplayName: () => ({
    displayName: null,
    setDisplayNameOverride: async () => {},
    effectiveDisplayName: null,
  }),
  useBundleMetadata: () => ({
    metadata: {},
    ready: true,
    mutate: async () => undefined,
  }),
  usePassphrase: () => ({
    sealed: false,
    unlock: async () => ({ok: true}),
    changePassphrase: async () => ({ok: true}),
  }),
}));

jest.mock('../bind', () => ({
  submitBindDevice: jest.fn(),
}));

jest.mock('../session-storage', () => ({
  loadSession: jest.fn(),
}));

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(),
}));

jest.mock('../chat/discover', () => ({
  discoverGeneralChannel: jest.fn(),
}));

jest.mock('../screens/DidScreen', () => ({
  DidScreen: () => null,
}));
jest.mock('../screens/VectorTestScreen', () => ({
  VectorTestScreen: () => null,
}));
jest.mock('../screens/ChannelScreen', () => ({
  ChannelScreen: () => null,
}));
jest.mock('../screens/AddServerScreen', () => ({
  AddServerScreen: () => null,
}));

import App from '../App';
import {submitBindDevice} from '../bind';
import {discoverGeneralChannel} from '../chat/discover';
import {useIdentityState, useWorkspaceServers} from '../identity-context';
import {getValidSessionToken} from '../session';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function maybeByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  const matches = tree.findAllByProps({testID});
  return matches[0] ?? null;
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

describe('App — auto-bind on server-tile click', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useIdentityState as jest.Mock).mockReturnValue({
      status: 'ready',
      identity: fakeIdentity(),
      error: null,
    });
    (useWorkspaceServers as jest.Mock).mockReturnValue({
      servers: [SERVER],
      addServer: jest.fn(),
    });
  });

  test('no stored session → submitBindDevice called once, then discoverGeneralChannel', async () => {
    (getValidSessionToken as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'no_session',
    });
    (submitBindDevice as jest.Mock).mockResolvedValue({
      ok: true,
      session: {
        sessionToken: 't',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });
    (discoverGeneralChannel as jest.Mock).mockResolvedValue({
      id: 'chan-id',
      name: 'general',
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(root!.root, `workspace-tile-${SERVER.url}`).props.onPress();
    });
    await flush();

    expect(submitBindDevice).toHaveBeenCalledTimes(1);
    expect(submitBindDevice).toHaveBeenCalledWith({
      serverUrl: SERVER.url,
      identity: expect.objectContaining({didFull: 'did:yawp:zZZZZZZ'}),
    });
    expect(discoverGeneralChannel).toHaveBeenCalledTimes(1);
    expect(discoverGeneralChannel).toHaveBeenCalledWith(SERVER.url);
    expect(maybeByTestId(root!.root, 'bind-error-banner')).toBeNull();
  });

  test('valid stored session → submitBindDevice NOT called; discoverGeneralChannel called', async () => {
    (getValidSessionToken as jest.Mock).mockResolvedValue({
      ok: true,
      sessionToken: 't',
    });
    (discoverGeneralChannel as jest.Mock).mockResolvedValue({
      id: 'chan-id',
      name: 'general',
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(root!.root, `workspace-tile-${SERVER.url}`).props.onPress();
    });
    await flush();

    expect(submitBindDevice).not.toHaveBeenCalled();
    expect(discoverGeneralChannel).toHaveBeenCalledTimes(1);
    expect(discoverGeneralChannel).toHaveBeenCalledWith(SERVER.url);
  });

  test('expired session + successful rotation → no bind call; discovery runs', async () => {
    (getValidSessionToken as jest.Mock).mockResolvedValue({
      ok: true,
      sessionToken: 'rotated-token',
    });
    (discoverGeneralChannel as jest.Mock).mockResolvedValue({
      id: 'chan-id',
      name: 'general',
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(root!.root, `workspace-tile-${SERVER.url}`).props.onPress();
    });
    await flush();

    expect(submitBindDevice).not.toHaveBeenCalled();
    expect(discoverGeneralChannel).toHaveBeenCalledTimes(1);
  });

  test('expired session + rotation_failed → falls through to submitBindDevice', async () => {
    (getValidSessionToken as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'rotation_failed',
    });
    (submitBindDevice as jest.Mock).mockResolvedValue({
      ok: true,
      session: {
        sessionToken: 't',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    });
    (discoverGeneralChannel as jest.Mock).mockResolvedValue({
      id: 'chan-id',
      name: 'general',
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(root!.root, `workspace-tile-${SERVER.url}`).props.onPress();
    });
    await flush();

    expect(submitBindDevice).toHaveBeenCalledTimes(1);
    expect(discoverGeneralChannel).toHaveBeenCalledTimes(1);
  });

  test('bind failure (identity_not_found) → discoverGeneralChannel NOT called; banner shown', async () => {
    (getValidSessionToken as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'no_session',
    });
    (submitBindDevice as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'identity_not_found',
      message: 'The server does not know this identity yet.',
    });
    (discoverGeneralChannel as jest.Mock).mockResolvedValue(null);

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      findByTestId(root!.root, `workspace-tile-${SERVER.url}`).props.onPress();
    });
    await flush();

    expect(submitBindDevice).toHaveBeenCalledTimes(1);
    expect(discoverGeneralChannel).not.toHaveBeenCalled();

    const banner = findByTestId(root!.root, 'bind-error-banner');
    expect(banner).toBeTruthy();
    const readd = findByTestId(root!.root, 'bind-error-readd');
    expect(readd).toBeTruthy();

    const texts: string[] = [];
    banner
      .findAll(
        n => (n.type as unknown) === 'Text' || (n.type as Function)?.name === 'Text',
      )
      .forEach(n => {
        const c = n.props.children;
        if (typeof c === 'string') texts.push(c);
      });
    expect(texts.join(' ')).toMatch(/does not know this identity/i);
  });
});
