import React from 'react';
import {Modal as RNModal, Pressable, ScrollView, Text, View} from 'react-native';

import {
  useDisplayName,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';
import {pointerCursor} from '../ui/cursor';

export type WorkspacesDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onSelectServer?: (server: WorkspaceServer) => void;
  onSelectDm?: () => void;
  onAddServer: () => void;
  activeServerUrl?: string | null;
  dmActive?: boolean;
};

function initials(label: string): string {
  const cleaned = label.replace(/^https?:\/\//, '');
  return cleaned.charAt(0).toUpperCase() || '?';
}

export function WorkspacesDrawer({
  visible,
  onClose,
  onSelectServer,
  onSelectDm,
  onAddServer,
  activeServerUrl = null,
  dmActive = false,
}: WorkspacesDrawerProps) {
  const {servers} = useWorkspaceServers();
  const {effectiveDisplayName} = useDisplayName();

  if (!visible) return null;

  function select(server: WorkspaceServer) {
    onClose();
    onSelectServer?.(server);
  }

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View
        testID="workspaces-drawer-backdrop"
        style={{flex: 1, flexDirection: 'row', backgroundColor: 'rgba(8,12,18,0.6)'}}>
        <View
          testID="workspaces-drawer"
          accessibilityLabel="workspaces"
          className="bg-surface border-r border-border"
          style={{width: 280, maxWidth: '85%', height: '100%', paddingTop: 48}}>
          <Text className="text-lg font-bold text-text px-4 pb-3">
            Workspaces
          </Text>
          <ScrollView contentContainerStyle={{paddingHorizontal: 8, paddingBottom: 24, gap: 4}}>
            {effectiveDisplayName ? (
              <View
                testID="workspaces-drawer-self"
                accessibilityLabel={`you ${effectiveDisplayName}`}
                className="flex-row items-center px-2 py-2 rounded-lg"
                style={{gap: 12}}>
                <View
                  className="rounded-xl bg-success items-center justify-center"
                  style={{width: 38, height: 38}}>
                  <Text className="text-sm font-bold text-on-primary">
                    {effectiveDisplayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-text" numberOfLines={1}>
                  {effectiveDisplayName}
                </Text>
              </View>
            ) : null}

            {servers.map(server => {
              const isActive = activeServerUrl === server.url && !dmActive;
              return (
                <Pressable
                  key={server.url}
                  testID={`workspaces-drawer-tile-${server.url}`}
                  accessibilityRole="button"
                  accessibilityLabel={`server ${server.label}`}
                  onPress={() => select(server)}
                  style={[{gap: 12}, pointerCursor]}
                  className={[
                    'flex-row items-center px-2 py-2 rounded-lg active:bg-surface-3',
                    isActive ? 'bg-surface-2 border border-primary' : '',
                  ].join(' ')}>
                  <View
                    className="rounded-xl bg-surface-2 items-center justify-center"
                    style={{width: 38, height: 38}}>
                    <Text className="text-sm font-bold text-text">
                      {initials(server.label)}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-text" numberOfLines={1}>
                    {server.label}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              testID="workspaces-drawer-dm"
              accessibilityRole="button"
              accessibilityLabel="direct messages"
              onPress={() => {
                onClose();
                onSelectDm?.();
              }}
              style={[{gap: 12}, pointerCursor]}
              className={[
                'flex-row items-center px-2 py-2 rounded-lg active:bg-surface-3',
                dmActive ? 'bg-surface-2 border border-primary' : '',
              ].join(' ')}>
              <View
                className="rounded-xl bg-surface-2 items-center justify-center"
                style={{width: 38, height: 38}}>
                <Text className="text-lg font-bold text-text">@</Text>
              </View>
              <Text className="text-sm font-bold text-text">Direct messages</Text>
            </Pressable>

            <Pressable
              testID="workspaces-drawer-add"
              accessibilityRole="button"
              accessibilityLabel="add server"
              onPress={() => {
                onClose();
                onAddServer();
              }}
              style={[{gap: 12}, pointerCursor]}
              className="flex-row items-center px-2 py-2 rounded-lg active:bg-surface-3">
              <View
                className="rounded-xl bg-surface-2 border border-border-soft items-center justify-center"
                style={{width: 38, height: 38}}>
                <Text className="text-2xl font-bold text-primary">+</Text>
              </View>
              <Text className="text-sm font-bold text-text">Add a server</Text>
            </Pressable>
          </ScrollView>
        </View>

        <Pressable
          testID="workspaces-drawer-scrim"
          accessibilityLabel="close workspaces"
          onPress={onClose}
          style={{flex: 1}}
        />
      </View>
    </RNModal>
  );
}
