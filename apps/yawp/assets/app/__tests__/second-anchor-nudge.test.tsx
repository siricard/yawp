/**
 * HomeScreen tests for the 7-day second-anchor nudge.
 *
 * The nudge state now lives inside the identity bundle's `metadata`, so
 * these tests pre-seed an identity bundle, optionally write a
 * `firstBoundAt`, and then render HomeScreen and assert on the banner's
 * presence.
 *
 * 1. Banner does NOT render before 7 days.
 * 2. Banner renders after 7 days when conditions hold.
 * 3. Dismiss hides the banner and the dismissal persists across reloads.
 * 4. Banner disappears when servers.length > 1.
 * 5. After identity replacement (mnemonic restore) the new identity sees
 * no firstBoundAt and no dismissal — fresh state.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {WorkspaceServer} from '../identity-context';

jest.mock('../identity-context', () => ({
  useIdentityState: jest.fn().mockReturnValue({
    status: 'ready',
    identity: null,
    error: null,
  }),
  useWorkspaceServers: jest.fn(),
  useDisplayName: () => ({
    displayName: null,
    setDisplayNameOverride: async () => {},
    effectiveDisplayName: null,
  }),
}));

jest.mock('../screens/DidScreen', () => ({
  DidScreen: () => null,
}));

import {useWorkspaceServers} from '../identity-context';
import {HomeScreen} from '../screens/HomeScreen';
import {
  __resetNudgeStoreForTests,
  recordFirstBoundAtIfUnset,
} from '../nudge-store';
import {bytesToB64Url, type IdentityBundleV1} from '../identity/bundle';
import {
  loadIdentity,
  saveIdentity,
} from '../identity/storage-bundle';

const DAY_MS = 24 * 60 * 60 * 1000;

const SERVER: WorkspaceServer = {
  url: 'http://localhost:4000',
  did: 'did:yawp:zZZZZZZ',
  role: 'Owner',
  label: 'localhost:4000',
};
const SERVER2: WorkspaceServer = {
  url: 'http://localhost:4001',
  did: 'did:yawp:zYYYYYY',
  role: 'Member',
  label: 'localhost:4001',
};

function makeBundle(deviceId = 'home-test-device'): IdentityBundleV1 {
  const sk = new Uint8Array(32);
  const pk = new Uint8Array(32);
  const sig = new Uint8Array(64);
  for (let i = 0; i < sk.length; i++) sk[i] = (i + 1) & 0xff;
  for (let i = 0; i < pk.length; i++) pk[i] = (i * 3) & 0xff;
  for (let i = 0; i < sig.length; i++) sig[i] = (i * 7) & 0xff;
  return {
    version: 1,
    master: {sk: bytesToB64Url(sk)},
    device: {
      deviceId,
      sk: bytesToB64Url(sk),
      pk: bytesToB64Url(pk),
      signature: bytesToB64Url(sig),
      issuedAt: '2026-05-27T00:00:00.000Z',
    },
  };
}

function maybe(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
): ReactTestRenderer.ReactTestInstance | null {
  return tree.findAllByProps({testID})[0] ?? null;
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderHome() {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(
      <HomeScreen
        bindError={null}
        onOpenPassphraseSettings={() => {}}
        onOpenAddServer={() => {}}
        onOpenVectorTest={() => {}}
        onClearBindError={() => {}}
      />,
    );
  });
  await settle();
  return root!;
}

describe('HomeScreen — second-anchor nudge', () => {
  beforeEach(async () => {
    await __resetNudgeStoreForTests();
    await saveIdentity(makeBundle());
    (useWorkspaceServers as jest.Mock).mockReturnValue({
      servers: [SERVER],
      addServer: jest.fn(),
    });
  });

  test('does NOT render the banner before 7 days', async () => {
    await recordFirstBoundAtIfUnset(new Date(Date.now() - 3 * DAY_MS));
    const root = await renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('does NOT render the banner before firstBoundAt is ever set', async () => {
    const root = await renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('renders the banner when 7 days have passed and only one server is bound', async () => {
    await recordFirstBoundAtIfUnset(new Date(Date.now() - 8 * DAY_MS));
    const root = await renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-cta')).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-dismiss')).toBeTruthy();
  });

  test('Dismiss persists across reloads (banner stays hidden on remount)', async () => {
    await recordFirstBoundAtIfUnset(new Date(Date.now() - 8 * DAY_MS));
    const root = await renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      maybe(root.root, 'second-anchor-nudge-dismiss')!.props.onPress();
    });
    await settle();

    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();

    const persisted = await loadIdentity();
    expect(persisted!.metadata?.secondAnchorNudgeDismissed).toBe(true);

    await ReactTestRenderer.act(async () => {
      root.unmount();
    });
    const root2 = await renderHome();
    expect(maybe(root2.root, 'second-anchor-nudge')).toBeNull();
  });

  test('Banner is suppressed once a second anchor is added (servers.length > 1)', async () => {
    await recordFirstBoundAtIfUnset(new Date(Date.now() - 30 * DAY_MS));
    (useWorkspaceServers as jest.Mock).mockReturnValue({
      servers: [SERVER, SERVER2],
      addServer: jest.fn(),
    });
    const root = await renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('After identity replacement, the new bundle sees fresh nudge state', async () => {
    await recordFirstBoundAtIfUnset(new Date(Date.now() - 30 * DAY_MS));
    const firstRoot = await renderHome();
    expect(maybe(firstRoot.root, 'second-anchor-nudge')).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      maybe(firstRoot.root, 'second-anchor-nudge-dismiss')!.props.onPress();
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      firstRoot.unmount();
    });

    await __resetNudgeStoreForTests();
    await saveIdentity(makeBundle('replaced-device'));

    const root2 = await renderHome();
    expect(maybe(root2.root, 'second-anchor-nudge')).toBeNull();

    const persisted = await loadIdentity();
    expect(persisted!.metadata?.firstBoundAt).toBeUndefined();
    expect(persisted!.metadata?.secondAnchorNudgeDismissed).toBeUndefined();
  });
});
