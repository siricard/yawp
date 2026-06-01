/**
 * Workspace-bar placement is driven purely by window WIDTH, never by
 * Platform.OS: a wide window renders the vertical desktop side rail, a
 * narrow window falls back to the horizontal/top bar. This holds on every
 * platform (web AND native), so macOS at a wide width matches desktop web.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {Identity, WorkspaceServer} from '../identity-context';

let mockWidth = 1280;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({width: mockWidth, height: 800, scale: 1, fontScale: 1}),
}));

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

async function renderAt(width: number) {
  mockWidth = width;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(<App />);
  });
  return root!;
}

describe('App — responsive workspace-bar placement by width', () => {
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

  test('wide window → vertical side rail', async () => {
    const root = await renderAt(1280);
    const style = barStyle(root.root);
    expect(style.width).toBe(72);
    expect(style.flexDirection).toBeUndefined();
  });

  test('narrow window → horizontal top bar', async () => {
    const root = await renderAt(400);
    const style = barStyle(root.root);
    expect(style.flexDirection).toBe('row');
    expect(style.width).toBeUndefined();
  });
});
