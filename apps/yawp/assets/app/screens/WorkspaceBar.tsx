
import React from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {useDisplayName, useWorkspaceServers, type WorkspaceServer} from '../identity-context';

type Props = {
  onAddServer: () => void;
  onSelectServer?: (server: WorkspaceServer) => void;
  /**
   * Render orientation; defaults to "vertical" (desktop rail). Mobile
   * callers pass "horizontal".
   */
  orientation?: 'vertical' | 'horizontal';
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
  orientation = 'vertical',
  bindingUrl = null,
}: Props) {
  const {servers} = useWorkspaceServers();
  const {effectiveDisplayName} = useDisplayName();
  const horizontal = orientation === 'horizontal';
  const selfInitial = effectiveDisplayName
    ? effectiveDisplayName.charAt(0).toUpperCase()
    : '?';

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
        {effectiveDisplayName ? (
          <View
            testID="workspace-self-tile"
            accessibilityLabel={`you ${effectiveDisplayName}`}
            className="w-12 h-12 rounded-2xl bg-emerald-700 items-center justify-center mb-2">
            <Text className="text-base font-bold text-slate-50">
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
              className={[
                'w-12 h-12 rounded-2xl bg-indigo-700 items-center justify-center active:bg-indigo-600',
                isBinding ? 'opacity-60 animate-pulse' : '',
              ].join(' ')}>
              <Text className="text-base font-bold text-slate-50">
                {initials(server.label)}
              </Text>
              {isBinding ? (
                <View
                  testID={`workspace-tile-binding-${server.url}`}
                  accessibilityLabel={`binding ${server.label}`}
                  pointerEvents="none"
                  style={{position: 'absolute', right: 4, bottom: 4}}
                  className="w-2 h-2 rounded-full bg-emerald-400"
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
          className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 items-center justify-center active:bg-slate-700">
          <Text className="text-2xl font-bold text-emerald-400">+</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
