import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {clearIdentity} from '../identity';
import {
  IdentityProvider,
  useIdentityState,
  useOnboarding,
  usePassphrase,
} from '../identity-context';
import {loadStoredEntry, saveSealedEnvelope} from '../identity/storage-bundle';
import {DID_PREFIX_LEN} from '../identity/did';
import type {SealedEnvelopeV2} from '../identity/seal';
import {LockedScreen} from '../screens/LockedScreen';

const PASSPHRASE = 'correct horse battery staple';

async function settle() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

function maybe(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
): ReactTestRenderer.ReactTestInstance | null {
  return tree.findAllByProps({testID})[0] ?? null;
}

type Handles = {
  state: ReturnType<typeof useIdentityState>;
  complete: ReturnType<typeof useOnboarding>['complete'];
  finish: ReturnType<typeof useOnboarding>['finish'];
  lockedDidPrefix: string | null;
};

function makeHarness() {
  const handles: {current: Handles | null} = {current: null};
  function Probe() {
    const state = useIdentityState();
    const {complete, finish} = useOnboarding();
    const {lockedDidPrefix} = usePassphrase();
    handles.current = {state, complete, finish, lockedDidPrefix};
    return null;
  }
  return {handles, Probe};
}

function makeSealedEnvelope(): SealedEnvelopeV2 {
  return {
    version: 2,
    sealed: true,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA',
    nonce: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  };
}

describe('LockedScreen identity context', () => {
  beforeEach(async () => {
    await clearIdentity();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  test('sealing an identity persists didPrefix and the locked screen renders a DidPill with it', async () => {
    const {handles, Probe} = makeHarness();

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      await handles.current!.complete({passphrase: PASSPHRASE, displayName: null});
    });
    await ReactTestRenderer.act(async () => {
      handles.current!.finish();
    });
    await settle();

    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind !== 'sealed') throw new Error('expected sealed');
    expect(entry!.didPrefix).toBeDefined();
    expect(entry!.didPrefix!.startsWith('did:yawp:')).toBe(true);
    expect(entry!.didPrefix!.length).toBe(DID_PREFIX_LEN);
    const expectedPrefix = entry!.didPrefix!;

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });

    let lockedRoot: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      lockedRoot = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <LockedScreen />
        </IdentityProvider>,
      );
    });
    await settle();

    expect(handles.current!.state.status).toBe('locked');
    expect(handles.current!.lockedDidPrefix).toBe(expectedPrefix);

    const tree = lockedRoot!.root;
    const pill = maybe(tree, 'locked-did-pill');
    expect(pill).not.toBeNull();
    expect(pill!.props.did).toBe(expectedPrefix);
    expect(maybe(tree, 'locked-identity-placeholder')).toBeNull();

    await ReactTestRenderer.act(async () => {
      lockedRoot!.unmount();
    });
  });

  test('a legacy sealed envelope without didPrefix renders the placeholder without crashing', async () => {
    await saveSealedEnvelope(makeSealedEnvelope());
    const entry = await loadStoredEntry();
    expect(entry!.kind).toBe('sealed');
    if (entry!.kind === 'sealed') {
      expect(entry!.didPrefix).toBeUndefined();
    }

    const {handles, Probe} = makeHarness();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
          <LockedScreen />
        </IdentityProvider>,
      );
    });
    await settle();

    expect(handles.current!.state.status).toBe('locked');
    expect(handles.current!.lockedDidPrefix).toBeNull();

    const tree = root!.root;
    expect(maybe(tree, 'locked-did-pill')).toBeNull();
    const placeholder = maybe(tree, 'locked-identity-placeholder');
    expect(placeholder).not.toBeNull();

    await ReactTestRenderer.act(async () => {
      root!.unmount();
    });
  });
});
