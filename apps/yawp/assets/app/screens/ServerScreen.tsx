import React, {useCallback, useEffect, useState} from 'react';
import {View} from 'react-native';

import {bitsForRole, useEditMode} from '../chat/edit-mode';
import {TabRow} from '../chat/TabRow';
import {
  createServerCategory,
  createServerChannel,
  fetchServerTree,
  groupChannelsByCategory,
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
  const [activeChannel, setActiveChannel] = useState<{
    id: string;
    name: string;
  }>({id: initialChannelId, name: initialChannelName});

  const effectiveBits = bitsForRole(role);
  const editMode = useEditMode(effectiveBits);
  const canModerate = role.toLowerCase() === 'owner' || role.toLowerCase() === 'admin';

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

  async function handleDeleteChannel(_channel: TreeChannel) {
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
        onAddChannel={handleAddChannel}
        onAddCategory={handleAddCategory}
        onDeleteChannel={handleDeleteChannel}
      />
      <View style={{flex: 1}}>
        <ChannelScreen
          key={activeChannel.id}
          serverUrl={serverUrl}
          serverId={serverId}
          serverLabel={serverLabel}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          canModerate={canModerate}
          onBack={onBack}
        />
      </View>
    </View>
  );
}
