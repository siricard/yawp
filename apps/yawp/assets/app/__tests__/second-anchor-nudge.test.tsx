/**
 * HomeScreen render tests for the 7-day second-anchor nudge.
 *
 * 1. Banner does NOT render before 7 days.
 * 2. Banner renders after 7 days when conditions hold.
 * 3. Dismiss hides the banner within the session.
 * 4. Banner disappears when servers.length flips to >1.
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
    setDisplayName: () => {},
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

function maybe(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
): ReactTestRenderer.ReactTestInstance | null {
  return tree.findAllByProps({testID})[0] ?? null;
}

function renderHome() {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
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
  return root!;
}

describe('HomeScreen — second-anchor nudge', () => {
  beforeEach(() => {
    __resetNudgeStoreForTests();
    (useWorkspaceServers as jest.Mock).mockReturnValue({
      servers: [SERVER],
      addServer: jest.fn(),
    });
  });

  test('does NOT render the banner before 7 days', () => {
    recordFirstBoundAtIfUnset(new Date(Date.now() - 3 * DAY_MS));
    const root = renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('does NOT render the banner before firstBoundAt is ever set', () => {
    const root = renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('renders the banner when 7 days have passed and only one server is bound', () => {
    recordFirstBoundAtIfUnset(new Date(Date.now() - 8 * DAY_MS));
    const root = renderHome();
    const banner = maybe(root.root, 'second-anchor-nudge');
    expect(banner).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-cta')).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-dismiss')).toBeTruthy();
  });

  test('Dismiss persists for the session (banner disappears after onPress)', () => {
    recordFirstBoundAtIfUnset(new Date(Date.now() - 8 * DAY_MS));
    const root = renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();

    ReactTestRenderer.act(() => {
      maybe(root.root, 'second-anchor-nudge-dismiss')!.props.onPress();
    });

    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });

  test('Banner is suppressed once a second anchor is added (servers.length > 1)', () => {
    recordFirstBoundAtIfUnset(new Date(Date.now() - 30 * DAY_MS));
    (useWorkspaceServers as jest.Mock).mockReturnValue({
      servers: [SERVER, SERVER2],
      addServer: jest.fn(),
    });
    const root = renderHome();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
  });
});
