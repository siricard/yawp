import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

let mockMetadata: {
  readReceiptsEnabled?: boolean;
  publishedProfile?: {anchors?: string[]};
  notificationPreferences?: {
    servers?: Record<string, 'all' | 'mentions_only' | 'muted'>;
    channels?: Record<string, 'all' | 'mentions_only' | 'muted'>;
    conversations?: Record<string, 'all' | 'mentions_only' | 'muted'>;
  };
} = {
  readReceiptsEnabled: true,
  publishedProfile: {anchors: ['http://localhost:4000']},
};
const mockMutate = jest.fn(async updater => {
  mockMetadata = updater(mockMetadata);
});
const mockSetReadReceipts = jest.fn(async (_config?: unknown) => ({
  success: true,
  data: {did: 'did:yawp:alice', readReceiptsEnabled: false},
}));

jest.mock('../identity-context', () => ({
  useIdentity: () => ({didFull: 'did:yawp:alice'}),
  useBundleMetadata: () => ({
    metadata: mockMetadata,
    mutate: mockMutate,
  }),
  usePassphrase: () => ({
    sealed: false,
    changePassphrase: async () => ({ok: true}),
    canUsePasskey: async () => false,
    passkeyAvailableHint: false,
    passkeyEnrolled: false,
    enrollPasskey: async () => ({ok: false, reason: 'unavailable'}),
  }),
}));

jest.mock('../ash_generated', () => ({
  setReadReceipts: (config: unknown) => mockSetReadReceipts(config),
}));

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(async () => ({ok: true, sessionToken: 'sess-token'})),
}));

import {PassphraseSettingsScreen} from '../screens/PassphraseSettingsScreen';

describe('PassphraseSettingsScreen read receipts', () => {
  beforeEach(() => {
    mockMetadata = {
      readReceiptsEnabled: true,
      publishedProfile: {anchors: ['http://localhost:4000']},
    };
    mockMutate.mockClear();
    mockSetReadReceipts.mockReset();
    mockSetReadReceipts.mockResolvedValue({
      success: true,
      data: {did: 'did:yawp:alice', readReceiptsEnabled: false},
    });
  });

  test('persists the global read receipts preference', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<PassphraseSettingsScreen onBack={() => {}} />);
    });

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({testID: 'settings-read-receipts-toggle'}).props.onPress();
    });

    expect(mockSetReadReceipts).toHaveBeenCalledWith({
      identity: {did: 'did:yawp:alice'},
      input: {readReceiptsEnabled: false},
      fields: ['did', 'readReceiptsEnabled'],
      headers: {Authorization: 'Bearer sess-token'},
    });
    expect(mockMetadata.readReceiptsEnabled).toBe(false);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('rolls back local metadata when persistence fails', async () => {
    mockSetReadReceipts.mockResolvedValue({
      success: false,
      data: {did: 'did:yawp:alice', readReceiptsEnabled: true},
    });
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<PassphraseSettingsScreen onBack={() => {}} />);
    });

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({testID: 'settings-read-receipts-toggle'}).props.onPress();
    });

    expect(mockMetadata.readReceiptsEnabled).toBe(true);
    expect(root.root.findByProps({testID: 'passphrase-error'}).props.children).toBe(
      'Could not update read receipts.',
    );

    ReactTestRenderer.act(() => root.unmount());
  });

  test('persists notification levels in bundle metadata', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<PassphraseSettingsScreen onBack={() => {}} />);
    });

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({testID: 'settings-notifications-channel-general'}).props.onPress();
    });

    expect(mockMetadata.notificationPreferences?.channels?.general).toBe('muted');

    ReactTestRenderer.act(() => root.unmount());
  });
});
