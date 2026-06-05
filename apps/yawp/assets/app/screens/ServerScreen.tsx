import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';

import {useEditMode} from '../chat/edit-mode';
import {useServerUnread} from '../chat/server-unread';
import {TabRow, type RecentDm} from '../chat/TabRow';
import {useWorkspaceServers} from '../identity-context';
import {pointerCursor} from '../ui/cursor';
import {
  createServerCategory,
  createServerChannel,
  destroyServerChannel,
  fetchServerTree,
  groupChannelsByCategory,
  recategorizeServerChannel,
  reorderServerCategories,
  reorderServerChannels,
  type ServerTree,
  type TreeChannel,
} from '../chat/server-tree';
import {ChannelScreen} from './ChannelScreen';

type Props = {
  serverUrl: string;
  serverId: string;
  serverLabel: string;
  initialChannelId: string;
  initialChannelName: string;
  onBack: () => void;
  onOpenDmList?: () => void;
  recentDms?: RecentDm[];
  onSelectRecentDm?: (dm: RecentDm) => void;
  onRemoved?: (reason: string) => void;
};

const EMPTY_TREE: ServerTree = {categories: [], channels: []};

export function ServerScreen({
  serverUrl,
  serverId,
  serverLabel,
  initialChannelId,
  initialChannelName,
  onBack,
  onOpenDmList,
  recentDms,
  onSelectRecentDm,
  onRemoved,
}: Props) {
  const [tree, setTree] = useState<ServerTree>(EMPTY_TREE);
  const [pendingDelete, setPendingDelete] = useState<TreeChannel | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [effectiveBits, setEffectiveBits] = useState(0);
  const [activeChannel, setActiveChannel] = useState<{
    id: string;
    name: string;
  }>({id: initialChannelId, name: initialChannelName});

  const editMode = useEditMode(effectiveBits);
  const {setServerUnread} = useWorkspaceServers();

  const refresh = useCallback(async () => {
    const next = await fetchServerTree(serverUrl, serverId);
    setTree(next);
  }, [serverUrl, serverId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const channelIds = tree.channels.map(c => c.id);
  const {unreadByChannel, total} = useServerUnread({
    serverUrl,
    serverId,
    channelIds,
    activeChannelId: activeChannel.id || null,
  });

  useEffect(() => {
    setServerUnread(serverUrl, total);
  }, [setServerUnread, serverUrl, total]);

  const treeWithUnread: ServerTree = {
    categories: tree.categories,
    channels: tree.channels.map(c => ({
      ...c,
      unreadCount:
        c.id === activeChannel.id ? 0 : unreadByChannel[c.id] ?? 0,
    })),
  };

  const groups = groupChannelsByCategory(treeWithUnread);

  function handleSelectChannel(channel: TreeChannel) {
    setActiveChannel({id: channel.id, name: channel.name});
  }

  async function handleReorder(
    _categoryId: string | null,
    orderedIds: string[],
  ) {
    const byId = new Map(tree.channels.map(c => [c.id, c]));
    const reordered = orderedIds
      .map((id, i) => {
        const c = byId.get(id);
        return c ? {...c, position: i} : null;
      })
      .filter((c): c is TreeChannel => c !== null);
    const untouched = tree.channels.filter(c => !orderedIds.includes(c.id));
    setTree({...tree, channels: [...reordered, ...untouched]});
    await reorderServerChannels(serverUrl, serverId, orderedIds);
    refresh();
  }

  async function handleAddChannel(categoryId: string | null) {
    const name = `channel-${tree.channels.length + 1}`;
    setManageError(null);
    const result = await createServerChannel(serverUrl, serverId, name, categoryId);
    if (!result.ok) {
      setManageError(result.message ?? 'Could not create the channel.');
      return;
    }
    refresh();
  }

  async function handleAddCategory() {
    const name = `folder-${tree.categories.length + 1}`;
    setManageError(null);
    const result = await createServerCategory(serverUrl, serverId, name);
    if (!result.ok) {
      setManageError(result.message ?? 'Could not create the category.');
      return;
    }
    refresh();
  }

  async function handleRecategorize(
    channelId: string,
    categoryId: string | null,
  ) {
    setTree({
      ...tree,
      channels: tree.channels.map(c =>
        c.id === channelId ? {...c, categoryId} : c,
      ),
    });
    await recategorizeServerChannel(serverUrl, channelId, categoryId);
    refresh();
  }

  async function handleReorderCategories(orderedIds: string[]) {
    const byId = new Map(tree.categories.map(c => [c.id, c]));
    const reordered = orderedIds
      .map((id, i) => {
        const c = byId.get(id);
        return c ? {...c, position: i} : null;
      })
      .filter((c): c is (typeof tree.categories)[number] => c !== null);
    const untouched = tree.categories.filter(c => !orderedIds.includes(c.id));
    setTree({...tree, categories: [...reordered, ...untouched]});
    await reorderServerCategories(serverUrl, serverId, orderedIds);
    refresh();
  }

  function handleDeleteChannel(channel: TreeChannel) {
    setPendingDelete(channel);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const remaining = tree.channels.filter(c => c.id !== target.id);
    setTree({...tree, channels: remaining});
    if (activeChannel.id === target.id) {
      const next = remaining[0];
      setActiveChannel(
        next ? {id: next.id, name: next.name} : {id: '', name: ''},
      );
    }
    setManageError(null);
    const result = await destroyServerChannel(serverUrl, target.id);
    if (!result.ok) {
      setManageError(result.message ?? 'Could not delete the channel.');
    }
    refresh();
  }

  return (
    <View testID="server-screen" style={{flex: 1, flexDirection: 'column'}}>
      <TabRow
        groups={groups}
        activeChannelId={activeChannel.id}
        onSelectChannel={handleSelectChannel}
        onOpenDmList={onOpenDmList}
        recentDms={recentDms}
        onSelectRecentDm={onSelectRecentDm}
        editMode={editMode.enabled}
        editAvailable={editMode.available}
        onToggleEdit={editMode.toggle}
        onReorderChannels={handleReorder}
        onRecategorizeChannel={handleRecategorize}
        onReorderCategories={handleReorderCategories}
        onAddChannel={handleAddChannel}
        onAddCategory={handleAddCategory}
        onDeleteChannel={handleDeleteChannel}
      />
      {manageError ? (
        <View
          testID="server-manage-error"
          className="px-6 py-2 bg-danger/20 border-b border-danger flex-row items-center justify-between">
          <Text className="text-xs text-danger flex-1">{manageError}</Text>
          <Pressable
            testID="server-manage-error-dismiss"
            accessibilityRole="button"
            accessibilityLabel="dismiss error"
            onPress={() => setManageError(null)}
            style={pointerCursor}
            className="ml-3 w-6 h-6 rounded-full bg-surface-2 items-center justify-center">
            <Text className="text-text-secondary text-xs">×</Text>
          </Pressable>
        </View>
      ) : null}
      {pendingDelete ? (
        <View
          testID="channel-delete-confirm"
          className="px-6 py-3 border-b border-danger bg-danger/10 flex-row items-center justify-between">
          <Text className="text-xs text-danger flex-1">
            Delete #{pendingDelete.name}? This cannot be undone.
          </Text>
          <View className="flex-row" style={{gap: 8}}>
            <Pressable
              testID="channel-delete-cancel"
              accessibilityRole="button"
              accessibilityLabel="cancel delete channel"
              onPress={() => setPendingDelete(null)}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-surface-2">
              <Text className="text-xs font-semibold text-text-secondary">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              testID="channel-delete-confirm-button"
              accessibilityRole="button"
              accessibilityLabel="confirm delete channel"
              onPress={handleConfirmDelete}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-danger">
              <Text className="text-xs font-semibold text-white">Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={{flex: 1}}>
        {activeChannel.id ? (
          <ChannelScreen
            key={activeChannel.id}
            serverUrl={serverUrl}
            serverId={serverId}
            serverLabel={serverLabel}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
            onEffectiveBits={setEffectiveBits}
            onBack={onBack}
            onRemoved={onRemoved}
          />
        ) : (
          <View
            testID="server-no-channels"
            className="flex-1 items-center justify-center px-6">
            <Text className="text-sm text-text-tertiary text-center">
              No channels yet. Create one to get started.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
