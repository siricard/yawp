import React from 'react';
import {Platform} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {WorkspaceServer} from '../identity-context';

(Platform as {OS: string}).OS = 'web';

const mockReorderServers = jest.fn();
let mockServers: WorkspaceServer[] = [];

jest.mock('../identity-context', () => ({
  useWorkspaceServers: () => ({
    servers: mockServers,
    addServer: jest.fn(),
    reorderServers: mockReorderServers,
  }),
  useDisplayName: () => ({effectiveDisplayName: 'Brave Otter'}),
}));

jest.mock('../ui/Draggable', () => {
  const ReactModule = require('react');
  return {
    Draggable: ({
      children,
      testID,
      onDragStart,
      onDrop,
      onDragEnd,
      enabled,
    }: {
      children: React.ReactNode;
      testID?: string;
      onDragStart?: () => void;
      onDrop?: () => void;
      onDragEnd?: () => void;
      enabled?: boolean;
    }) =>
      ReactModule.createElement(
        'draggable-mock',
        {testID, onDragStart, onDrop, onDragEnd, enabled},
        children,
      ),
  };
});

import {WorkspaceBar} from '../screens/WorkspaceBar';

function mk(url: string, extra: Partial<WorkspaceServer> = {}): WorkspaceServer {
  return {url, did: 'did:yawp:z', role: 'Member', label: url, ...extra};
}

function countHost(
  root: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): number {
  return root.root
    .findAllByProps({testID})
    .filter(n => typeof n.type === 'string').length;
}

function render(props: Partial<React.ComponentProps<typeof WorkspaceBar>> = {}) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <WorkspaceBar onAddServer={() => {}} {...props} />,
    );
  });
  return root!;
}

describe('WorkspaceBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServers = [mk('http://a'), mk('http://b')];
  });

  test('renders a dedicated @ DM tile', () => {
    const root = render();
    expect(countHost(root, 'workspace-dm-tile')).toBe(1);
  });

  test('DM tile press invokes onSelectDm', () => {
    const onSelectDm = jest.fn();
    const root = render({onSelectDm});
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'workspace-dm-tile'}).props.onPress();
    });
    expect(onSelectDm).toHaveBeenCalledTimes(1);
  });

  test('renders an unread dot for a server with unreadCount', () => {
    mockServers = [mk('http://a', {unreadCount: 3}), mk('http://b')];
    const root = render();
    expect(countHost(root, 'workspace-unread-dot')).toBe(1);
  });

  test('a negative unreadCount renders a mention-styled dot', () => {
    mockServers = [mk('http://a', {unreadCount: -1})];
    const root = render();
    const dot = root.root.findByProps({testID: 'workspace-unread-dot'});
    expect(dot.props.accessibilityLabel).toBe('mention');
  });

  test('selecting a server tile invokes onSelectServer', () => {
    const onSelectServer = jest.fn();
    const root = render({onSelectServer});
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'workspace-tile-http://a'}).props.onPress();
    });
    expect(onSelectServer).toHaveBeenCalledWith(mockServers[0]);
  });

  test('dragging one tile onto another calls reorderServers with the new order', () => {
    const root = render();
    const tileA = root.root.findByProps({testID: 'workspace-tile-drag-http://a'});
    const tileB = root.root.findByProps({testID: 'workspace-tile-drag-http://b'});
    ReactTestRenderer.act(() => {
      tileA.props.onDragStart();
      tileB.props.onDrop();
    });
    expect(mockReorderServers).toHaveBeenCalledWith(['http://b', 'http://a']);
  });
});
