/**
 * nudge-store tests.
 *
 * Covers:
 * - The pure `shouldShowSecondAnchorNudge` gate.
 * - `useRecordFirstBoundAt` writes through `mutateBundleMetadata`, so the
 * timestamp is persisted into the live identity bundle's metadata and
 * survives lock/unlock for sealed identities.
 * - Dismissal goes through the same path.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  IdentityProvider,
  useBundleMetadata,
  useIdentityState,
  useOnboarding,
  usePassphrase,
} from '../identity-context';
import {clearIdentity} from '../identity';
import {loadIdentity, loadStoredEntry} from '../identity/storage-bundle';
import {
  __resetNudgeStoreForTests,
  shouldShowSecondAnchorNudge,
  useRecordFirstBoundAt,
} from '../nudge-store';

const DAY_MS = 24 * 60 * 60 * 1000;

async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

describe('shouldShowSecondAnchorNudge (pure gate)', () => {
  test('returns false before 7 days have elapsed', () => {
    const now = new Date('2026-01-08T00:00:00.000Z');
    const firstBoundAt = new Date(
      now.getTime() - 6 * DAY_MS - 1,
    ).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns true after 7 days, with one server, undismissed', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(true);
  });

  test('returns false when 2+ servers are bound', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 2,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when dismissed', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt,
        dismissed: true,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when firstBoundAt is unset', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 1,
        firstBoundAt: null,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });

  test('returns false when serversCount is 0', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const firstBoundAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    expect(
      shouldShowSecondAnchorNudge({
        serversCount: 0,
        firstBoundAt,
        dismissed: false,
        now,
      }),
    ).toBe(false);
  });
});

/**
 * Type-only handles captured from hooks inside the provider tree, so test
 * bodies can drive the same flows the UI would.
 */
type Handles = {
  state: ReturnType<typeof useIdentityState>;
  complete: ReturnType<typeof useOnboarding>['complete'];
  finish: ReturnType<typeof useOnboarding>['finish'];
  recordFirstBound: ReturnType<typeof useRecordFirstBoundAt>['recordFirstBound'];
  metadata: ReturnType<typeof useBundleMetadata>['metadata'];
  changePassphrase: ReturnType<typeof usePassphrase>['changePassphrase'];
};

function makeHandlesProbe() {
  const handles: {current: Handles | null} = {current: null};
  function Probe() {
    const state = useIdentityState();
    const {complete, finish} = useOnboarding();
    const {recordFirstBound} = useRecordFirstBoundAt();
    const {metadata} = useBundleMetadata();
    const {changePassphrase} = usePassphrase();
    handles.current = {
      state,
      complete,
      finish,
      recordFirstBound,
      metadata,
      changePassphrase,
    };
    return null;
  }
  return {handles, Probe};
}

describe('useRecordFirstBoundAt + bundle metadata persistence', () => {
  beforeEach(async () => {
    await __resetNudgeStoreForTests();
    await clearIdentity();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  test('records firstBoundAt into bundle metadata on an unsealed identity', async () => {
    const {handles, Probe} = makeHandlesProbe();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        React.createElement(
          IdentityProvider,
          null,
          React.createElement(Probe),
        ),
      );
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      await handles.current!.complete({passphrase: null, displayName: null});
    });
    await ReactTestRenderer.act(async () => {
      handles.current!.finish();
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(
        new Date('2026-03-01T00:00:00.000Z'),
      );
    });
    await settle();
    const persisted = await loadIdentity();
    expect(persisted!.metadata?.firstBoundAt).toBe(
      '2026-03-01T00:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(
        new Date('2026-04-01T00:00:00.000Z'),
      );
    });
    const after = await loadIdentity();
    expect(after!.metadata?.firstBoundAt).toBe('2026-03-01T00:00:00.000Z');

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('records firstBoundAt on a sealed identity without losing the seal', async () => {
    const {handles, Probe} = makeHandlesProbe();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        React.createElement(
          IdentityProvider,
          null,
          React.createElement(Probe),
        ),
      );
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      await handles.current!.complete({
        passphrase: 'correct horse battery staple',
        displayName: null,
      });
    });
    await ReactTestRenderer.act(async () => {
      handles.current!.finish();
    });
    await settle();

    const beforeEntry = await loadStoredEntry();
    expect(beforeEntry!.kind).toBe('sealed');

    await ReactTestRenderer.act(async () => {
      await handles.current!.recordFirstBound(
        new Date('2026-03-01T00:00:00.000Z'),
      );
    });
    await settle();

    const afterEntry = await loadStoredEntry();
    expect(afterEntry!.kind).toBe('sealed');

    expect(handles.current!.metadata.firstBoundAt).toBe(
      '2026-03-01T00:00:00.000Z',
    );

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });
});
