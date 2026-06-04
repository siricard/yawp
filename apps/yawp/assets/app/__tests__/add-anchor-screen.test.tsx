import React from 'react';
import {act, create} from 'react-test-renderer';

import type {Identity, WorkspaceServer} from '../identity-context';

jest.mock('../add-anchor', () => ({
  submitAddAnchor: jest.fn(),
}));

jest.mock('../identity-context', () => ({
  useIdentityState: jest.fn(),
  useWorkspaceServers: jest.fn(),
  useDisplayName: jest.fn(),
  useBundleMetadata: jest.fn(),
}));

import {submitAddAnchor} from '../add-anchor';
import {useBundleMetadata, useDisplayName, useIdentityState, useWorkspaceServers} from '../identity-context';
import {AddAnchorScreen} from '../screens/AddAnchorScreen';

const submitAddAnchorMock = submitAddAnchor as unknown as jest.Mock;
const useIdentityStateMock = useIdentityState as unknown as jest.Mock;
const useWorkspaceServersMock = useWorkspaceServers as unknown as jest.Mock;
const useDisplayNameMock = useDisplayName as unknown as jest.Mock;
const useBundleMetadataMock = useBundleMetadata as unknown as jest.Mock;

const SERVER: WorkspaceServer = {
  url: 'localhost:4000',
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
    deviceIssuedAt: '2026-05-25T20:34:12.967Z',
    fingerprint: 'yp:0000 · 0000 · 0000 · 0000',
    sign: () => stubSig,
    signDevice: () => stubSig,
  };
}

function setup(metadata: Record<string, unknown>) {
  const mutate = jest.fn(async mut => mut(metadata));
  useIdentityStateMock.mockReturnValue({
    status: 'ready',
    identity: fakeIdentity(),
  });
  useWorkspaceServersMock.mockReturnValue({servers: [SERVER]});
  useDisplayNameMock.mockReturnValue({
    displayName: null,
    effectiveDisplayName: 'Display From Context',
    setDisplayNameOverride: async () => undefined,
  });
  useBundleMetadataMock.mockReturnValue({
    metadata,
    ready: true,
    mutate,
  });
  submitAddAnchorMock.mockResolvedValue({
    ok: true,
    anchorList: ['localhost:4000', 'anchor-b.example'],
    profileVersion: 8,
  });
  return {mutate};
}

describe('AddAnchorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads the current profile snapshot from bundle metadata and persists the bump', async () => {
    const {mutate} = setup({
      profileVersion: 7,
      publishedProfile: {
        display_name: 'Published Alice',
        avatar_ref: 'avatar:alice',
        bio: 'hello',
        anchors: ['localhost:4000'],
      },
    });

    const onAdded = jest.fn();
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<AddAnchorScreen onCancel={jest.fn()} onAdded={onAdded} />);
    });
    await act(async () => {
      root!.root.findByProps({testID: 'new-anchor-input'}).props.onChangeText('anchor-b.example');
    });
    await act(async () => {
      await root!.root.findByProps({testID: 'add-anchor-submit'}).props.onPress();
    });

    expect(submitAddAnchorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          profileVersion: 7,
          anchors: ['localhost:4000'],
          displayName: 'Published Alice',
          avatarRef: 'avatar:alice',
          bio: 'hello',
        },
      }),
    );
    expect(mutate).toHaveBeenCalledTimes(1);
    const nextMetadata = mutate.mock.calls[0][0]({
      publishedProfile: {
        avatar_ref: 'avatar:alice',
        bio: 'hello',
      },
    });
    expect(nextMetadata).toEqual({
      publishedProfile: {
        avatar_ref: 'avatar:alice',
        bio: 'hello',
        display_name: 'Published Alice',
        anchors: ['localhost:4000', 'anchor-b.example'],
      },
      profileVersion: 8,
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  test('defaults legacy bundles without profileVersion to first publish', async () => {
    setup({});

    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<AddAnchorScreen onCancel={jest.fn()} onAdded={jest.fn()} />);
    });
    await act(async () => {
      root!.root.findByProps({testID: 'new-anchor-input'}).props.onChangeText('anchor-b.example');
    });
    await act(async () => {
      await root!.root.findByProps({testID: 'add-anchor-submit'}).props.onPress();
    });

    expect(submitAddAnchorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          profileVersion: 0,
          anchors: ['localhost:4000'],
          displayName: 'Display From Context',
        }),
      }),
    );
  });
});
