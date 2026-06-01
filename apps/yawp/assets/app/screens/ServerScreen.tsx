import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';

import {bitsForRole, useEditMode} from '../chat/edit-mode';
import {TabRow} from '../chat/TabRow';
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
  role: string;
  initialChannelId: string;
  initialChannelName: string;
  onBack: () => void;
};

const EMPTY_TREE: ServerTree = {categories: [], channels: []};

export function ServerScreen({
  serverUrl,
  serverId,
  serverLabel,
  role,
  initialChannelId,
  initialChannelName,
  onBack,
}: Props) {
  const [tree, setTree] = useState<ServerTree>(EMPTY_TREE);
  const [pendingDelete, setPendingDelete] = useState<TreeChannel | null>(null);
  const [activeChannel, setActiveChannel] = useState<{
    id: string;
    name: string;
  }>({id: initialChannelId, name: initialChannelName});

  const effectiveBits = bitsForRole(role);
  const editMode = useEditMode(effectiveBits);

  const refresh = useCallback(async () => {
    const next = await fetchServerTree(serverUrl, serverId);
    setTree(next);
  }, [serverUrl, serverId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = groupChannelsByCategory(tree);

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
    await createServerChannel(serverUrl, serverId, name, categoryId);
    refresh();
  }

  async function handleAddCategory() {
    const name = `folder-${tree.categories.length + 1}`;
    await createServerCategory(serverUrl, serverId, name);
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
    setTree({
      ...tree,
      channels: tree.channels.filter(c => c.id !== target.id),
    });
    await destroyServerChannel(serverUrl, target.id);
    refresh();
  }

  return (
    <View testID="server-screen" style={{flex: 1, flexDirection: 'column'}}>
      <TabRow
        groups={groups}
        activeChannelId={activeChannel.id}
        onSelectChannel={handleSelectChannel}
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
        <ChannelScreen
          key={activeChannel.id}
          serverUrl={serverUrl}
          serverId={serverId}
          serverLabel={serverLabel}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          effectiveBits={effectiveBits}
          onBack={onBack}
        />
      </View>
    </View>
  );
}
