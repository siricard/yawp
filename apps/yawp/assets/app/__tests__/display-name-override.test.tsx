
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {clearIdentity} from '../identity';
import {IdentityProvider, useDisplayName} from '../identity-context';
import {loadIdentity} from '../identity/storage-bundle';
import {defaultDisplayName} from '../identity/word-pair';

describe('useDisplayName effectiveDisplayName', () => {
  beforeEach(async () => {
    await clearIdentity();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  async function settle() {
    for (let i = 0; i < 5; i++) {
      await ReactTestRenderer.act(async () => {
        await Promise.resolve();
      });
    }
  }

  test('falls back to the word-pair default when no override is set', async () => {
    let observed: ReturnType<typeof useDisplayName> | null = null;
    let observedMasterPk: Uint8Array | null = null;
    function Probe() {
      observed = useDisplayName();
      const state = (
        require('../identity-context') as typeof import('../identity-context')
      ).useIdentityState();
      if (state.status === 'ready') {
        observedMasterPk = state.identity.masterPk;
      }
      return null;
    }

    let runComplete: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['complete']
      : never;
    let runFinish: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['finish']
      : never;
    function CaptureOnboarding() {
      const {complete, finish} = (
        require('../identity-context') as typeof import('../identity-context')
      ).useOnboarding();
      runComplete = complete;
      runFinish = finish;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <CaptureOnboarding />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await runComplete!({passphrase: null, displayName: null});
    });
    await ReactTestRenderer.act(async () => {
      runFinish!();
    });
    await settle();

    expect(observedMasterPk).not.toBeNull();
    expect(observed!.displayName).toBeNull();
    expect(observed!.effectiveDisplayName).toBe(
      defaultDisplayName(observedMasterPk!),
    );

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('honors the override when set', async () => {
    let observed: ReturnType<typeof useDisplayName> | null = null;
    function Probe() {
      observed = useDisplayName();
      return null;
    }
    let runComplete: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['complete']
      : never;
    let runFinish: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['finish']
      : never;
    function CaptureOnboarding() {
      const {complete, finish} = (
        require('../identity-context') as typeof import('../identity-context')
      ).useOnboarding();
      runComplete = complete;
      runFinish = finish;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <CaptureOnboarding />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await runComplete!({
        passphrase: null,
        displayName: 'Captain Override',
      });
    });
    await ReactTestRenderer.act(async () => {
      runFinish!();
    });
    await settle();

    expect(observed!.displayName).toBe('Captain Override');
    expect(observed!.effectiveDisplayName).toBe('Captain Override');

    const persisted = await loadIdentity();
    expect(persisted!.metadata?.displayNameOverride).toBe('Captain Override');

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('setDisplayNameOverride writes into the bundle; clearing removes the key', async () => {
    let observed: ReturnType<typeof useDisplayName> | null = null;
    function Probe() {
      observed = useDisplayName();
      return null;
    }
    let runComplete: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['complete']
      : never;
    let runFinish: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['finish']
      : never;
    function CaptureOnboarding() {
      const {complete, finish} = (
        require('../identity-context') as typeof import('../identity-context')
      ).useOnboarding();
      runComplete = complete;
      runFinish = finish;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <CaptureOnboarding />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await runComplete!({passphrase: null, displayName: null});
    });
    await ReactTestRenderer.act(async () => {
      runFinish!();
    });
    await settle();

    const beforeBundle = await loadIdentity();
    expect(beforeBundle!.metadata?.displayNameOverride).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      await observed!.setDisplayNameOverride('Renamed Yawper');
    });
    await settle();
    expect(observed!.displayName).toBe('Renamed Yawper');
    const afterSet = await loadIdentity();
    expect(afterSet!.metadata?.displayNameOverride).toBe('Renamed Yawper');

    await ReactTestRenderer.act(async () => {
      await observed!.setDisplayNameOverride(null);
    });
    await settle();
    expect(observed!.displayName).toBeNull();
    const afterClear = await loadIdentity();
    expect(afterClear!.metadata?.displayNameOverride).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });

  test('restoring a different identity does not leak the previous override', async () => {
    let observed: ReturnType<typeof useDisplayName> | null = null;
    let observedMasterPk: Uint8Array | null = null;
    function Probe() {
      observed = useDisplayName();
      const state = (
        require('../identity-context') as typeof import('../identity-context')
      ).useIdentityState();
      if (state.status === 'ready') {
        observedMasterPk = state.identity.masterPk;
      }
      return null;
    }
    let runComplete: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['complete']
      : never;
    let runFinish: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['finish']
      : never;
    let runRestore: typeof import('../identity-context').useOnboarding extends () => infer R
      ? R['restore']
      : never;
    function CaptureOnboarding() {
      const {complete, finish, restore} = (
        require('../identity-context') as typeof import('../identity-context')
      ).useOnboarding();
      runComplete = complete;
      runFinish = finish;
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <CaptureOnboarding />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await runComplete!({passphrase: null, displayName: 'Stale Override'});
    });
    await ReactTestRenderer.act(async () => {
      runFinish!();
    });
    await settle();
    expect(observed!.displayName).toBe('Stale Override');

    const VALID_MNEMONIC = [
      'abandon','abandon','abandon','abandon','abandon','abandon',
      'abandon','abandon','abandon','abandon','abandon','about',
    ];
    await ReactTestRenderer.act(async () => {
      const result = await runRestore!(VALID_MNEMONIC);
      expect(result.ok).toBe(true);
    });
    await settle();

    expect(observed!.displayName).toBeNull();
    expect(observedMasterPk).not.toBeNull();
    expect(observed!.effectiveDisplayName).toBe(
      defaultDisplayName(observedMasterPk!),
    );
    const restoredBundle = await loadIdentity();
    expect(restoredBundle!.metadata?.displayNameOverride).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });
});
