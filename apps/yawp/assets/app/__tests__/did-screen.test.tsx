/**
 * Render smoke test for the DidScreen. Asserts that the contract is
 * honored: the visible "Your DID" row renders the full `did:yawp:<base58>`
 * form (via `identity.didFull`), not the bare base58.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {Identity} from '../identity-context';

jest.mock('../identity-context', () => ({
  useIdentityState: jest.fn(),
  useDisplayName: () => ({
    displayName: null,
    setDisplayNameOverride: async () => {},
    effectiveDisplayName: null,
  }),
}));
jest.mock('../identity-vector', () => ({
  runIdentityVectorCheck: () => ({pass: true, details: {}}),
}));

import Clipboard from '@react-native-clipboard/clipboard';

import {useIdentityState} from '../identity-context';
import {DidScreen} from '../screens/DidScreen';

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

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function collectText(node: ReactTestRenderer.ReactTestInstance): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const inst = n as ReactTestRenderer.ReactTestInstance | null;
    if (inst && inst.props && inst.props.children !== undefined) {
      walk(inst.props.children);
    }
  };
  walk(node);
  return out.join('');
}

describe('DidScreen', () => {
  test('renders the full did:yawp:<base58> form in the Your DID row', async () => {
    (useIdentityState as jest.Mock).mockReturnValue({
      status: 'ready',
      identity: fakeIdentity(),
      error: null,
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DidScreen onOpenVectorTest={() => {}} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const didTextNode = findByTestId(root!.root, 'did-text');
    const rendered = collectText(didTextNode);
    expect(rendered).toContain('did:yawp:zZZZZZZ');
  });

  test('renders the fingerprint', async () => {
    (useIdentityState as jest.Mock).mockReturnValue({
      status: 'ready',
      identity: fakeIdentity(),
      error: null,
    });

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DidScreen onOpenVectorTest={() => {}} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const fingerprintNode = findByTestId(root!.root, 'fingerprint-text');
    const rendered = collectText(fingerprintNode);
    expect(rendered).toContain('yp:0000 · 0000 · 0000 · 0000');
  });

  test('fires onCopy when the fingerprint copy affordance is pressed', async () => {
    (useIdentityState as jest.Mock).mockReturnValue({
      status: 'ready',
      identity: fakeIdentity(),
      error: null,
    });

    const onCopy = jest.fn();

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DidScreen onOpenVectorTest={() => {}} onCopy={onCopy} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const copyBtn = findByTestId(root!.root, 'copy-fingerprint-btn');
    await ReactTestRenderer.act(async () => {
      copyBtn.props.onPress();
    });

    expect(onCopy).toHaveBeenCalledWith('yp:0000 · 0000 · 0000 · 0000');
  });

  test('writes to the system clipboard when copy fingerprint is pressed', async () => {
    (useIdentityState as jest.Mock).mockReturnValue({
      status: 'ready',
      identity: fakeIdentity(),
      error: null,
    });

    (Clipboard.setString as jest.Mock).mockClear();

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<DidScreen onOpenVectorTest={() => {}} />);
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const copyBtn = findByTestId(root!.root, 'copy-fingerprint-btn');
    await ReactTestRenderer.act(async () => {
      copyBtn.props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(Clipboard.setString).toHaveBeenCalledWith(
      'yp:0000 · 0000 · 0000 · 0000',
    );
  });
});
