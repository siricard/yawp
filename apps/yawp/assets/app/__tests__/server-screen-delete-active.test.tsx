import React from 'react';
import {Platform} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {ServerTree} from '../chat/server-tree';

(Platform as {OS: string}).OS = 'web';

const MANAGE_CHANNELS = 1 << 3;

jest.mock('../chat/server-tree', () => {
  const actual = jest.requireActual('../chat/server-tree');
  return {
    ...actual,
    fetchServerTree: jest.fn(),
    destroyServerChannel: jest.fn(async () => ({ok: true})),
  };
});

jest.mock('../chat/server-unread', () => ({
  useServerUnread: () => ({unreadByChannel: {}, total: 0}),
}));

jest.mock('../identity-context', () => ({
  useWorkspaceServers: () => ({
    servers: [],
    addServer: jest.fn(),
    removeServer: jest.fn(),
    setServerUnread: jest.fn(),
    reorderServers: jest.fn(),
  }),
}));

jest.mock('../screens/ChannelScreen', () => {
  const ReactLib = require('react');
  const {Text} = require('react-native');
  return {
    ChannelScreen: ({
      channelId,
      onEffectiveBits,
    }: {
      channelId: string;
      onEffectiveBits?: (bits: number) => void;
    }) => {
      ReactLib.useEffect(() => {
        onEffectiveBits?.(1 << 3);
      }, [onEffectiveBits]);
      return ReactLib.createElement(Text, {testID: 'active-channel-id'}, channelId);
    },
  };
});

import {fetchServerTree} from '../chat/server-tree';
import {ServerScreen} from '../screens/ServerScreen';

const TREE: ServerTree = {
  categories: [],
  channels: [
    {id: 'ch-1', name: 'general', categoryId: null, position: 0},
    {id: 'ch-2', name: 'random', categoryId: null, position: 1},
  ],
};

async function flush() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function activeChannelId(root: ReactTestRenderer.ReactTestRenderer): string {
  return root.root.findByProps({testID: 'active-channel-id'}).props.children;
}

describe('ServerScreen deleting the active channel', () => {
  beforeEach(() => {
    (fetchServerTree as jest.Mock).mockResolvedValue(TREE);
  });

  test('switches away from the deleted active channel to a remaining one', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <ServerScreen
          serverUrl="http://localhost:4000"
          serverId="server-1"
          serverLabel="localhost:4000"
          initialChannelId="ch-1"
          initialChannelName="general"
          onBack={() => {}}
        />,
      );
    });
    await flush();

    const tree = root!.root;
    expect(activeChannelId(root!)).toBe('ch-1');

    await ReactTestRenderer.act(async () => {
      tree.findByProps({testID: 'edit-mode-toggle'}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      tree.findByProps({testID: 'channel-tab-delete-ch-1'}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      tree
        .findByProps({testID: 'channel-delete-confirm-button'})
        .props.onPress();
    });
    await flush();

    expect(activeChannelId(root!)).toBe('ch-2');
  });
});
