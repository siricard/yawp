import React, {useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {Badge} from '../ui/Badge';
import {pointerCursor} from '../ui/cursor';
import type {CategoryGroup, TreeChannel} from './server-tree';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export type RecentDm = {
  id: string;
  label: string;
  unreadCount?: number;
};

type Props = {
  groups: CategoryGroup[];
  activeChannelId: string | null;
  onSelectChannel: (channel: TreeChannel) => void;
  recentDms?: RecentDm[];
  onOpenDmList?: () => void;
  editMode?: boolean;
  editAvailable?: boolean;
  onToggleEdit?: () => void;
  onDeleteChannel?: (channel: TreeChannel) => void;
  onReorderChannels?: (categoryId: string | null, orderedIds: string[]) => void;
  onAddChannel?: (categoryId: string | null) => void;
  onAddCategory?: () => void;
};

function Divider() {
  return (
    <View
      style={{width: 1, height: 22, marginHorizontal: 4}}
      className="bg-border-soft"
    />
  );
}

function ChannelTab({
  channel,
  active,
  editMode,
  onSelect,
  onDelete,
  onDragStart,
  onDrop,
  onDragEnd,
  dragging,
}: {
  channel: TreeChannel;
  active: boolean;
  editMode: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
  const unread = channel.unreadCount ?? 0;
  const dragProps =
    Platform.OS === 'web' && editMode
      ? ({
          draggable: true,
          onDragStart,
          onDragOver: (e: {preventDefault?: () => void}) => e.preventDefault?.(),
          onDrop,
          onDragEnd,
        } as Record<string, unknown>)
      : {};
  return (
    <Pressable
      testID={`channel-tab-${channel.id}`}
      accessibilityRole="button"
      accessibilityLabel={`channel ${channel.name}`}
      onPress={onSelect}
      {...dragProps}
      style={[{paddingVertical: 6, paddingHorizontal: 12}, pointerCursor]}
      className={[
        'rounded-pill flex-row items-center',
        active ? 'bg-surface-2 border border-border-soft' : '',
        dragging ? 'opacity-40' : '',
      ].join(' ')}>
      <Text
        className={active ? 'text-text-secondary' : 'text-text-tertiary'}
        style={{fontFamily: monospace, fontWeight: '700', marginRight: 4}}>
        #
      </Text>
      <Text
        className={[
          'text-xs font-semibold',
          active ? 'text-text' : 'text-text-secondary',
        ].join(' ')}>
        {channel.name}
      </Text>
      {unread > 0 ? (
        <View style={{marginLeft: 6}}>
          <Badge
            testID={`channel-tab-badge-${channel.id}`}
            count={unread}
            tone="primary"
          />
        </View>
      ) : null}
      {editMode && onDelete ? (
        <Pressable
          testID={`channel-tab-delete-${channel.id}`}
          accessibilityRole="button"
          accessibilityLabel={`delete channel ${channel.name}`}
          onPress={onDelete}
          style={[{marginLeft: 6}, pointerCursor]}
          className="w-4 h-4 rounded-full bg-danger/20 items-center justify-center">
          <Text className="text-danger text-xs">×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function TabRow({
  groups,
  activeChannelId,
  onSelectChannel,
  recentDms = [],
  onOpenDmList,
  editMode = false,
  editAvailable = false,
  onToggleEdit,
  onDeleteChannel,
  onReorderChannels,
  onAddChannel,
  onAddCategory,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  function startDrag(id: string) {
    dragRef.current = id;
    setDragId(id);
  }

  function endDrag() {
    dragRef.current = null;
    setDragId(null);
  }

  function handleDrop(
    categoryId: string | null,
    channels: TreeChannel[],
    targetId: string,
  ) {
    const source = dragRef.current;
    if (!source || source === targetId) {
      endDrag();
      return;
    }
    const ids = channels.map(c => c.id);
    const from = ids.indexOf(source);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      endDrag();
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorderChannels?.(categoryId, ids);
    endDrag();
  }

  return (
    <View
      testID="tab-row"
      accessibilityLabel="channel tab row"
      className="bg-bg border-b border-border"
      style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8}}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
        <View
          testID="recent-dm-section"
          style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          <Text
            className="text-text-tertiary uppercase"
            style={{fontFamily: monospace, fontSize: 10, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 4}}>
            Recent
          </Text>
          {recentDms.map(dm => (
            <Pressable
              key={dm.id}
              testID={`dm-tab-${dm.id}`}
              accessibilityRole="button"
              accessibilityLabel={`direct message ${dm.label}`}
              onPress={onOpenDmList}
              style={[{paddingVertical: 6, paddingHorizontal: 12}, pointerCursor]}
              className="rounded-pill flex-row items-center">
              <Text className="text-xs font-semibold text-text-secondary">
                {dm.label}
              </Text>
              {dm.unreadCount ? (
                <View style={{marginLeft: 6}}>
                  <Badge count={dm.unreadCount} tone="primary" />
                </View>
              ) : null}
            </Pressable>
          ))}
          <Pressable
            testID="dm-more-button"
            accessibilityRole="button"
            accessibilityLabel="more direct messages"
            onPress={onOpenDmList}
            style={[{paddingVertical: 6, paddingHorizontal: 12}, pointerCursor]}
            className="rounded-pill flex-row items-center">
            <Text className="text-xs font-semibold text-text-tertiary">
              More →
            </Text>
          </Pressable>
        </View>

        <Divider />

        {groups.map((group, gi) => (
          <View
            key={group.category ? group.category.id : `uncategorized-${gi}`}
            style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
            {group.category ? (
              <Text
                testID={`category-label-${group.category.id}`}
                className="text-text-tertiary uppercase"
                style={{fontFamily: monospace, fontSize: 10, fontWeight: '600', letterSpacing: 1, paddingHorizontal: 4}}>
                {group.category.name}
              </Text>
            ) : null}
            {group.channels.map(channel => (
              <ChannelTab
                key={channel.id}
                channel={channel}
                active={channel.id === activeChannelId}
                editMode={editMode}
                onSelect={() => onSelectChannel(channel)}
                onDelete={
                  onDeleteChannel ? () => onDeleteChannel(channel) : undefined
                }
                onDragStart={() => startDrag(channel.id)}
                onDrop={() =>
                  handleDrop(
                    group.category ? group.category.id : null,
                    group.channels,
                    channel.id,
                  )
                }
                onDragEnd={endDrag}
                dragging={dragId === channel.id}
              />
            ))}
            {editMode ? (
              <Pressable
                testID={`add-channel-${group.category ? group.category.id : 'uncategorized'}`}
                accessibilityRole="button"
                accessibilityLabel="add channel"
                onPress={() =>
                  onAddChannel?.(group.category ? group.category.id : null)
                }
                style={[{paddingVertical: 6, paddingHorizontal: 10}, pointerCursor]}
                className="rounded-pill border border-border-soft">
                <Text className="text-xs font-bold text-primary">+ #</Text>
              </Pressable>
            ) : null}
          </View>
        ))}

        {editMode ? (
          <Pressable
            testID="add-category-button"
            accessibilityRole="button"
            accessibilityLabel="add category"
            onPress={onAddCategory}
            style={[{paddingVertical: 6, paddingHorizontal: 10}, pointerCursor]}
            className="rounded-pill border border-border-soft">
            <Text className="text-xs font-bold text-primary">+ folder</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {editAvailable ? (
        <Pressable
          testID="edit-mode-toggle"
          accessibilityRole="button"
          accessibilityLabel={editMode ? 'done editing' : 'edit channels'}
          onPress={onToggleEdit}
          style={[{paddingVertical: 6, paddingHorizontal: 12, marginLeft: 6}, pointerCursor]}
          className={[
            'rounded-pill',
            editMode ? 'bg-primary' : 'bg-surface-2',
          ].join(' ')}>
          <Text
            className={[
              'text-xs font-semibold',
              editMode ? 'text-on-primary' : 'text-text-secondary',
            ].join(' ')}>
            {editMode ? 'Done' : 'Edit'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
