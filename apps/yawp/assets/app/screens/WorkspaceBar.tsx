
import React, {useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {
  useDisplayName,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';
import {pointerCursor} from '../ui/cursor';

export const WORKSPACE_BAR_HEIGHT = 59;

type Props = {
  onAddServer: () => void;
  onSelectServer?: (server: WorkspaceServer) => void;
  /**
   * URL of the tile whose lazy bind RPC is currently in
   * flight, if any. The matching tile renders a muted/pulsing overlay
   * so the user has feedback while we mint a fresh session.
   */
  bindingUrl?: string | null;
  /** Whether the dedicated DM (`@`) tile is the active surface. */
  dmActive?: boolean;
  /** Open the dedicated DM surface. */
  onSelectDm?: () => void;
  /** URL of the currently-open server, to render the active ring. */
  activeServerUrl?: string | null;
};

function initials(label: string): string {
  const cleaned = label.replace(/^https?:\/\//, '');
  const first = cleaned.charAt(0).toUpperCase();
  return first || '?';
}

function UnreadDot({count}: {count: number}) {
  const mention = count < 0;
  return (
    <View
      testID="workspace-unread-dot"
      accessibilityLabel={mention ? 'mention' : 'unread'}
      pointerEvents="none"
      style={{position: 'absolute', top: -3, right: -3}}
      className={[
        'w-2.5 h-2.5 rounded-full border-2 border-bg',
        mention ? 'bg-danger' : 'bg-primary',
      ].join(' ')}
    />
  );
}

export function WorkspaceBar({
  onAddServer,
  onSelectServer,
  bindingUrl = null,
  dmActive = false,
  onSelectDm,
  activeServerUrl = null,
}: Props) {
  const {servers, reorderServers} = useWorkspaceServers();
  const {effectiveDisplayName} = useDisplayName();
  const selfInitial = effectiveDisplayName
    ? effectiveDisplayName.charAt(0).toUpperCase()
    : '?';
  const isWeb = Platform.OS === 'web';
  const [dragUrl, setDragUrl] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  function startDrag(url: string) {
    dragRef.current = url;
    setDragUrl(url);
  }

  function endDrag() {
    dragRef.current = null;
    setDragUrl(null);
  }

  function handleDrop(targetUrl: string) {
    const source = dragRef.current;
    if (!source || source === targetUrl) {
      endDrag();
      return;
    }
    const urls = servers.map(s => s.url);
    const from = urls.indexOf(source);
    const to = urls.indexOf(targetUrl);
    if (from === -1 || to === -1) {
      endDrag();
      return;
    }
    urls.splice(to, 0, urls.splice(from, 1)[0]);
    reorderServers(urls);
    endDrag();
  }

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
          const isActive = activeServerUrl === server.url && !dmActive;
          const unread = server.unreadCount ?? 0;
          const dragProps = isWeb
            ? ({
                draggable: !isBinding,
                onDragStart: () => startDrag(server.url),
                onDragOver: (e: {preventDefault?: () => void}) =>
                  e.preventDefault?.(),
                onDrop: () => handleDrop(server.url),
                onDragEnd: endDrag,
              } as Record<string, unknown>)
            : {};
          return (
            <Pressable
              key={server.url}
              testID={`workspace-tile-${server.url}`}
              accessibilityRole="button"
              accessibilityLabel={`server ${server.label}`}
              onPress={() => onSelectServer?.(server)}
              disabled={isBinding}
              {...dragProps}
              style={[{width: 38, height: 38}, isBinding ? undefined : pointerCursor]}
              className={[
                'rounded-xl bg-surface-2 items-center justify-center active:bg-surface-3',
                isActive ? 'border-2 border-primary' : '',
                isBinding ? 'opacity-60 animate-pulse' : '',
                dragUrl === server.url ? 'opacity-40' : '',
              ].join(' ')}>
              <Text className="text-sm font-bold text-text">
                {initials(server.label)}
              </Text>
              {unread !== 0 && !isBinding ? <UnreadDot count={unread} /> : null}
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
          testID="workspace-dm-tile"
          accessibilityRole="button"
          accessibilityLabel="direct messages"
          onPress={() => onSelectDm?.()}
          style={[{width: 38, height: 38}, pointerCursor]}
          className={[
            'rounded-xl bg-surface-2 items-center justify-center active:bg-surface-3',
            dmActive ? 'border-2 border-primary' : '',
          ].join(' ')}>
          <Text className="text-lg font-bold text-text">@</Text>
        </Pressable>

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
