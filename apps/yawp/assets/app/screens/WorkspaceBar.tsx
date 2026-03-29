
import React from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {useWorkspaceServers, type WorkspaceServer} from '../identity-context';

type Props = {
  onAddServer: () => void;
  onSelectServer?: (server: WorkspaceServer) => void;
  /**
   * Render orientation; defaults to "vertical" (desktop rail). Mobile
   * callers pass "horizontal".
   */
  orientation?: 'vertical' | 'horizontal';
};

function initials(label: string): string {
  const cleaned = label.replace(/^https?:\/\//, '');
  const first = cleaned.charAt(0).toUpperCase();
  return first || '?';
}

export function WorkspaceBar({
  onAddServer,
  onSelectServer,
  orientation = 'vertical',
}: Props) {
  const {servers} = useWorkspaceServers();
  const horizontal = orientation === 'horizontal';

  return (
    <View
      testID="workspace-bar"
      accessibilityLabel="workspace bar"
      className={
        horizontal
          ? 'bg-slate-950 px-2 py-2 border-b border-slate-800'
          : 'bg-slate-950 px-2 py-3 border-r border-slate-800'
      }
      style={
        horizontal
          ? {flexDirection: 'row', alignItems: 'center'}
          : Platform.OS === 'web'
            ? {width: 72}
            : {width: 72}
      }>
      <ScrollView
        horizontal={horizontal}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          horizontal
            ? {flexDirection: 'row', alignItems: 'center', gap: 8}
            : {flexDirection: 'column', alignItems: 'center', gap: 8}
        }>
        {servers.map(server => (
          <Pressable
            key={server.url}
            testID={`workspace-tile-${server.url}`}
            accessibilityRole="button"
            accessibilityLabel={`server ${server.label}`}
            onPress={() => onSelectServer?.(server)}
            className="w-12 h-12 rounded-2xl bg-indigo-700 items-center justify-center active:bg-indigo-600">
            <Text className="text-base font-bold text-slate-50">
              {initials(server.label)}
            </Text>
          </Pressable>
        ))}

        <Pressable
          testID="workspace-add-button"
          accessibilityRole="button"
          accessibilityLabel="add server"
          onPress={onAddServer}
          className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 items-center justify-center active:bg-slate-700">
          <Text className="text-2xl font-bold text-emerald-400">+</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
