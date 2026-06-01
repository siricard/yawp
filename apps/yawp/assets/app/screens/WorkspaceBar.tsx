
import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

import {useDisplayName, useWorkspaceServers, type WorkspaceServer} from '../identity-context';
import {pointerCursor} from '../ui/cursor';

type Props = {
  onAddServer: () => void;
  onSelectServer?: (server: WorkspaceServer) => void;
  /**
   * URL of the tile whose lazy bind RPC is currently in
   * flight, if any. The matching tile renders a muted/pulsing overlay
   * so the user has feedback while we mint a fresh session.
   */
  bindingUrl?: string | null;
};

function initials(label: string): string {
  const cleaned = label.replace(/^https?:\/\//, '');
  const first = cleaned.charAt(0).toUpperCase();
  return first || '?';
}

export function WorkspaceBar({
  onAddServer,
  onSelectServer,
  bindingUrl = null,
}: Props) {
  const {servers} = useWorkspaceServers();
  const {effectiveDisplayName} = useDisplayName();
  const selfInitial = effectiveDisplayName
    ? effectiveDisplayName.charAt(0).toUpperCase()
    : '?';

  return (
    <View
      testID="workspace-bar"
      accessibilityLabel="workspace bar"
      className="bg-bg border-b border-border"
      style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10}}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        {effectiveDisplayName ? (
          <View
            testID="workspace-self-tile"
            accessibilityLabel={`you ${effectiveDisplayName}`}
            className="rounded-xl bg-success items-center justify-center"
            style={{width: 38, height: 38}}>
            <Text className="text-sm font-bold text-on-primary">
              {selfInitial}
            </Text>
          </View>
        ) : null}

        {servers.map(server => {
          const isBinding = bindingUrl === server.url;
          return (
            <Pressable
              key={server.url}
              testID={`workspace-tile-${server.url}`}
              accessibilityRole="button"
              accessibilityLabel={`server ${server.label}`}
              onPress={() => onSelectServer?.(server)}
              disabled={isBinding}
              style={[{width: 38, height: 38}, isBinding ? undefined : pointerCursor]}
              className={[
                'rounded-xl bg-surface-2 items-center justify-center active:bg-surface-3',
                isBinding ? 'opacity-60 animate-pulse' : '',
              ].join(' ')}>
              <Text className="text-sm font-bold text-text">
                {initials(server.label)}
              </Text>
              {isBinding ? (
                <View
                  testID={`workspace-tile-binding-${server.url}`}
                  accessibilityLabel={`binding ${server.label}`}
                  pointerEvents="none"
                  style={{position: 'absolute', right: 4, bottom: 4}}
                  className="w-2 h-2 rounded-full bg-success"
                />
              ) : null}
            </Pressable>
          );
        })}

        <Pressable
          testID="workspace-add-button"
          accessibilityRole="button"
          accessibilityLabel="add server"
          onPress={onAddServer}
          style={[{width: 38, height: 38}, pointerCursor]}
          className="rounded-xl bg-surface-2 border border-border-soft items-center justify-center active:bg-surface-3">
          <Text className="text-2xl font-bold text-primary">+</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
