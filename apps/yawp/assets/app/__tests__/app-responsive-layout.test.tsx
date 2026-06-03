/**
 * The workspaces bar is a horizontal strip at the TOP on every width and
 * platform (web AND native) — there is no left side rail anywhere. macOS at
 * a wide width matches desktop web: the bar is on top, content below.
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
  useBundleMetadata: () => ({metadata: {}, ready: true, mutate: async () => undefined}),
  usePassphrase: () => ({
    sealed: false,
    unlock: async () => ({ok: true}),
    changePassphrase: async () => ({ok: true}),
  }),
}));

jest.mock('../chat/anchor-connection', () => ({
  AnchorConnectionProvider: ({children}: {children: unknown}) => children,
  useAnchorStatus: () => ({status: 'connected', degraded: false}),
}));
jest.mock('../bind', () => ({submitBindDevice: jest.fn()}));
jest.mock('../session', () => ({getValidSessionToken: jest.fn()}));
jest.mock('../chat/discover', () => ({discoverGeneralChannel: jest.fn()}));
jest.mock('../screens/VectorTestScreen', () => ({VectorTestScreen: () => null}));
jest.mock('../screens/ChannelScreen', () => ({ChannelScreen: () => null}));
jest.mock('../screens/AddServerScreen', () => ({AddServerScreen: () => null}));

import App from '../App';
import {useIdentityState, useWorkspaceServers} from '../identity-context';

function flatStyle(node: ReactTestRenderer.ReactTestInstance) {
  const s = node.props.style;
  if (Array.isArray(s)) {
    return Object.assign({}, ...s.filter(Boolean));
  }
  return s ?? {};
}

function barStyle(root: ReactTestRenderer.ReactTestInstance) {
  const hosts = root
    .findAllByProps({testID: 'workspace-bar'})
    .filter(n => typeof n.type === 'string');
  return flatStyle(hosts[0]);
}

async function render() {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
  return root!;
}

describe('App — workspace bar is a top horizontal strip at every width', () => {
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

  test('wide window → horizontal top strip, no fixed-width rail', async () => {
    const root = await render();
    const style = barStyle(root.root);
    expect(style.flexDirection).toBe('row');
    expect(style.width).toBeUndefined();
  });

  test('narrow window → horizontal top strip', async () => {
    const root = await render();
    const style = barStyle(root.root);
    expect(style.flexDirection).toBe('row');
    expect(style.width).toBeUndefined();
  });
});
