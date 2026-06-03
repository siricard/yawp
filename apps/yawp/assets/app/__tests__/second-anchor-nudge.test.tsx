/**
 * HomeScreen tests for the 7-day second-anchor nudge.
 *
 * The nudge state lives inside the identity bundle's `metadata`. The
 * tests run the real `<IdentityProvider>`, complete onboarding (with or
 * without a passphrase), pre-seed `firstBoundAt` through the same hook
 * AddServerScreen uses, and then render `<HomeScreen>` to assert on the
 * banner. The lock/unlock cycle is exercised explicitly for the sealed
 * cases so we verify the dismissal + firstBoundAt survive (and the
 * bundle stays sealed).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  IdentityProvider,
  useIdentityState,
  useOnboarding,
  usePassphrase,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';
import {clearIdentity} from '../identity';
import {loadStoredEntry} from '../identity/storage-bundle';
import {useRecordFirstBoundAt} from '../nudge-store';
import {HomeScreen} from '../screens/HomeScreen';

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSPHRASE = 'correct horse battery staple';

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

async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

type Handles = {
  state: ReturnType<typeof useIdentityState>;
  complete: ReturnType<typeof useOnboarding>['complete'];
  finish: ReturnType<typeof useOnboarding>['finish'];
  unlock: ReturnType<typeof usePassphrase>['unlock'];
  sealed: boolean;
  recordFirstBound: ReturnType<typeof useRecordFirstBoundAt>['recordFirstBound'];
  addServer: (server: WorkspaceServer) => void;
};

function makeHandles() {
  const handles: {current: Handles | null} = {current: null};
  function Probe() {
    const state = useIdentityState();
    const {complete, finish} = useOnboarding();
    const {unlock, sealed} = usePassphrase();
    const {recordFirstBound} = useRecordFirstBoundAt();
    const {addServer} = useWorkspaceServers();
    handles.current = {
      state,
      complete,
      finish,
      unlock,
      sealed,
      recordFirstBound,
      addServer,
    };
    return null;
  }
  return {handles, Probe};
}

async function renderApp(initialServers: WorkspaceServer[]) {
  const {handles, Probe} = makeHandles();
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(
      <IdentityProvider>
        <Probe />
        <RenderHomeIfReady />
      </IdentityProvider>,
    );
  });
  await settle();
  for (const s of initialServers) {
    await ReactTestRenderer.act(async () => {
      handles.current!.addServer(s);
    });
  }
  await settle();
  return {root: root!, handles};
}

function RenderHomeIfReady() {
  const state = useIdentityState();
  if (state.status !== 'ready') return null;
  return (
    <HomeScreen
      bindError={null}
      onOpenPassphraseSettings={() => {}}
      onOpenAddServer={() => {}}
      onOpenAddAnchor={() => {}}
      onOpenVectorTest={() => {}}
      onClearBindError={() => {}}
    />
  );
}

async function completeOnboardingFlow(
  handles: {current: Handles | null},
  opts: {passphrase: string | null},
) {
  await ReactTestRenderer.act(async () => {
    await handles.current!.complete({
      passphrase: opts.passphrase,
      displayName: null,
    });
  });
  await ReactTestRenderer.act(async () => {
    handles.current!.finish();
  });
  await settle();
}

describe('HomeScreen — second-anchor nudge', () => {
  beforeEach(async () => {
    await clearIdentity();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  test('does NOT render the banner before 7 days', async () => {
    const {root, handles} = await renderApp([SERVER]);
    await completeOnboardingFlow(handles, {passphrase: null});
    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(new Date(Date.now() - 3 * DAY_MS));
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      root.unmount();
    });
  });

  test('does NOT render the banner before firstBoundAt is ever set', async () => {
    const {root, handles} = await renderApp([SERVER]);
    await completeOnboardingFlow(handles, {passphrase: null});
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      root.unmount();
    });
  });

  test('renders the banner when 7 days have passed and only one server is bound', async () => {
    const {root, handles} = await renderApp([SERVER]);
    await completeOnboardingFlow(handles, {passphrase: null});
    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(new Date(Date.now() - 8 * DAY_MS));
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-cta')).toBeTruthy();
    expect(maybe(root.root, 'second-anchor-nudge-dismiss')).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      root.unmount();
    });
  });

  test('Dismiss persists into the bundle (banner stays hidden after re-mount)', async () => {
    const {root, handles} = await renderApp([SERVER]);
    await completeOnboardingFlow(handles, {passphrase: null});
    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(new Date(Date.now() - 8 * DAY_MS));
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      maybe(root.root, 'second-anchor-nudge-dismiss')!.props.onPress();
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      root.unmount();
    });

    const remount = await renderApp([SERVER]);
    expect(remount.handles.current!.state.status).toBe('ready');
    expect(maybe(remount.root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      remount.root.unmount();
    });
  });

  test('Banner is suppressed once a second anchor is added (servers.length > 1)', async () => {
    const {root, handles} = await renderApp([SERVER, SERVER2]);
    await completeOnboardingFlow(handles, {passphrase: null});
    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(new Date(Date.now() - 30 * DAY_MS));
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      root.unmount();
    });
  });

  test('Sealed identity: firstBoundAt + dismiss survive lock/unlock and the bundle stays sealed', async () => {
    const {root, handles} = await renderApp([SERVER]);
    await completeOnboardingFlow(handles, {passphrase: PASSPHRASE});
    expect(handles.current!.sealed).toBe(true);

    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(new Date(Date.now() - 8 * DAY_MS));
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      maybe(root.root, 'second-anchor-nudge-dismiss')!.props.onPress();
    });
    await settle();
    expect(maybe(root.root, 'second-anchor-nudge')).toBeNull();

    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');

    await ReactTestRenderer.act(async () => {
      root.unmount();
    });

    const remount = await renderApp([SERVER]);
    expect(remount.handles.current!.state.status).toBe('locked');
    await ReactTestRenderer.act(async () => {
      const result = await remount.handles.current!.unlock(PASSPHRASE);
      expect(result.ok).toBe(true);
    });
    await settle();
    expect(remount.handles.current!.state.status).toBe('ready');
    expect(remount.handles.current!.sealed).toBe(true);
    expect(maybe(remount.root.root, 'second-anchor-nudge')).toBeNull();
    await ReactTestRenderer.act(async () => {
      remount.root.unmount();
    });
  });
});
