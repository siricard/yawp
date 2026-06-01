import React from 'react';
import {Platform} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {TabRow} from '../chat/TabRow';
import type {CategoryGroup} from '../chat/server-tree';

(Platform as {OS: string}).OS = 'web';

const GROUPS: CategoryGroup[] = [
  {
    category: null,
    channels: [{id: 'ch-1', name: 'general', categoryId: null, position: 0}],
  },
  {
    category: {id: 'cat-a', name: 'Information', position: 0},
    channels: [
      {id: 'ch-2', name: 'design', categoryId: 'cat-a', position: 0, unreadCount: 2},
      {id: 'ch-3', name: 'ship-log', categoryId: 'cat-a', position: 1},
    ],
  },
];

function countHost(
  root: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): number {
  return root.root
    .findAllByProps({testID})
    .filter(n => typeof n.type === 'string').length;
}

function render(props: Partial<React.ComponentProps<typeof TabRow>> = {}) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <TabRow
        groups={GROUPS}
        activeChannelId="ch-1"
        onSelectChannel={() => {}}
        {...props}
      />,
    );
  });
  return root!;
}

describe('TabRow', () => {
  test('renders a tab per channel and a category label', () => {
    const root = render();
    expect(countHost(root, 'channel-tab-ch-1')).toBe(1);
    expect(countHost(root, 'channel-tab-ch-2')).toBe(1);
    expect(countHost(root, 'category-label-cat-a')).toBe(1);
  });

  test('renders the Recent DM section with a More button', () => {
    const root = render();
    expect(countHost(root, 'recent-dm-section')).toBe(1);
    expect(countHost(root, 'dm-more-button')).toBe(1);
  });

  test('a channel with unreadCount renders a badge', () => {
    const root = render();
    expect(countHost(root, 'channel-tab-badge-ch-2')).toBeGreaterThan(0);
  });

  test('selecting a channel invokes onSelectChannel', () => {
    const onSelectChannel = jest.fn();
    const root = render({onSelectChannel});
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'channel-tab-ch-2'}).props.onPress();
    });
    expect(onSelectChannel).toHaveBeenCalledWith(GROUPS[1].channels[0]);
  });

  test('edit toggle is hidden when edit is unavailable', () => {
    const root = render({editAvailable: false});
    expect(countHost(root, 'edit-mode-toggle')).toBe(0);
  });

  test('edit toggle appears for admins', () => {
    const onToggleEdit = jest.fn();
    const root = render({editAvailable: true, onToggleEdit});
    const toggle = root.root.findByProps({testID: 'edit-mode-toggle'});
    ReactTestRenderer.act(() => toggle.props.onPress());
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  test('edit mode surfaces delete shortcuts and add affordances', () => {
    const root = render({
      editAvailable: true,
      editMode: true,
      onDeleteChannel: jest.fn(),
    });
    expect(countHost(root, 'channel-tab-delete-ch-2')).toBe(1);
    expect(countHost(root, 'add-category-button')).toBe(1);
  });

  test('dragging a channel onto a sibling reorders within the category', () => {
    const onReorderChannels = jest.fn();
    const root = render({
      editAvailable: true,
      editMode: true,
      onReorderChannels,
    });
    const ch2 = root.root.findByProps({testID: 'channel-tab-ch-2'});
    const ch3 = root.root.findByProps({testID: 'channel-tab-ch-3'});
    ReactTestRenderer.act(() => {
      ch2.props.onDragStart();
      ch3.props.onDrop();
    });
    expect(onReorderChannels).toHaveBeenCalledWith('cat-a', ['ch-3', 'ch-2']);
  });

  test('non-edit mode hides delete shortcuts', () => {
    const root = render({
      editAvailable: true,
      editMode: false,
      onDeleteChannel: jest.fn(),
    });
    expect(countHost(root, 'channel-tab-delete-ch-2')).toBe(0);
  });
});
