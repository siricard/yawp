
import React, {useEffect, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useChannel, type ChannelMessage} from '../chat/channel-store';
import {useDisplayName, useIdentityState} from '../identity-context';
import {WORKSPACE_BAR_HEIGHT} from './WorkspaceBar';

type Props = {
  serverUrl: string;
  serverId: string;
  serverLabel: string;
  channelId: string;
  channelName: string;
  onBack: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/**
 * Build the display form of a message author DID.
 *
 * Wire ships the bare base58 form; the client prefixes `did:yawp:` and truncates long
 * values for the row label.
 */
export function displayAuthor(authorDid: string): string {
  const full = `did:yawp:${authorDid}`;
  return full.length <= 18 ? full : `${full.slice(0, 12)}…${full.slice(-4)}`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function MessageRow({
  message,
  selfDid,
  selfDisplayName,
}: {
  message: ChannelMessage;
  selfDid: string | null;
  selfDisplayName: string | null;
}) {
  const isSelf = selfDid !== null && message.sender_did === selfDid;
  const label =
    isSelf && selfDisplayName ? selfDisplayName : displayAuthor(message.sender_did);
  return (
    <View
      testID={`channel-message-${message.id}`}
      className="px-6 py-2">
      <View className="flex-row items-baseline" style={{gap: 8}}>
        <Text
          className="text-sm font-bold text-text"
          style={{fontFamily: monospace}}>
          {label}
        </Text>
        <Text
          className="text-xs text-text-tertiary"
          style={{fontFamily: monospace}}>
          {formatTimestamp(message.server_inserted_at)}
        </Text>
      </View>
      <Text
        className={[
          'text-sm mt-1 leading-5',
          message.body === null ? 'text-text-tertiary italic' : 'text-text',
        ].join(' ')}>
        {message.body === null ? '[deleted]' : message.body}
      </Text>
    </View>
  );
}

export function ChannelScreen({
  serverUrl,
  serverId,
  serverLabel,
  channelId,
  channelName,
  onBack,
}: Props) {
  const {status, errorMessage, messages, send} = useChannel(
    serverUrl,
    serverId,
    channelId,
  );
  const insets = useSafeAreaInsets();
  const identityState = useIdentityState();
  const {effectiveDisplayName} = useDisplayName();
  const selfDid =
    identityState.status === 'ready' ? identityState.identity.did : null;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({animated: true});
    });
  }, [messages.length]);

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    send(trimmed);
    setDraft('');
  }

  const statusClass =
    status === 'joined'
      ? 'text-xs text-success'
      : status === 'error'
        ? 'text-xs text-danger'
        : 'text-xs text-text-tertiary';

  return (
    <KeyboardAvoidingView
      testID="channel-screen"
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? insets.top + WORKSPACE_BAR_HEIGHT : 0
      }>
      <View className="px-6 py-3 border-b border-border-soft flex-row items-center bg-surface">
        <Pressable
          testID="channel-back-button"
          accessibilityRole="button"
          accessibilityLabel="back"
          onPress={onBack}
          className="mr-3 w-8 h-8 rounded-pill bg-surface-2 active:bg-surface-3 items-center justify-center">
          <Text className="text-text-secondary text-sm">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-base font-bold text-text">
            <Text className="text-primary" style={{fontFamily: monospace}}>
              #
            </Text>
            {channelName}
          </Text>
          <Text
            className="text-xs text-text-tertiary mt-0.5"
            style={{fontFamily: monospace}}>
            {serverLabel}
          </Text>
        </View>
        <Text testID="channel-status" className={statusClass} style={{fontFamily: monospace}}>
          {status}
        </Text>
      </View>

      {errorMessage ? (
        <View
          testID="channel-error"
          className="px-6 py-2 bg-danger/20 border-b border-danger">
          <Text className="text-xs text-danger">{errorMessage}</Text>
        </View>
      ) : null}

      <ScrollView
        testID="channel-message-list"
        ref={ref => {
          scrollRef.current = ref;
        }}
        className="flex-1"
        contentContainerStyle={{paddingVertical: 12}}>
        {messages.map(message => (
          <MessageRow
            key={message.id}
            message={message}
            selfDid={selfDid}
            selfDisplayName={effectiveDisplayName}
          />
        ))}
      </ScrollView>

      <View className="px-4 py-3 border-t border-border-soft bg-bg flex-row items-center" style={{gap: 8}}>
        <TextInput
          testID="channel-message-input"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          editable={status === 'joined'}
          placeholder={
            status === 'joined' ? `Message #${channelName}` : 'Connecting…'
          }
          placeholderTextColor="#7a8290"
          className="flex-1 px-4 py-2 rounded-pill bg-surface-2 text-text border border-border-soft"
        />
        <Pressable
          testID="channel-message-send"
          accessibilityRole="button"
          accessibilityLabel="send message"
          onPress={handleSend}
          disabled={status !== 'joined' || draft.trim().length === 0}
          className={[
            'px-5 py-2 rounded-pill bg-primary active:bg-primary-hover',
            status !== 'joined' || draft.trim().length === 0
              ? 'opacity-50'
              : '',
          ].join(' ')}>
          <Text className="text-on-primary font-semibold">Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
