
import React, {useEffect, useRef, useState} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {useChannel, type ChannelMessage} from '../chat/channel-store';

type Props = {
  serverUrl: string;
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

function MessageRow({message}: {message: ChannelMessage}) {
  return (
    <View
      testID={`channel-message-${message.id}`}
      className="px-4 py-2 border-b border-slate-800">
      <View className="flex-row items-baseline">
        <Text
          className="text-xs text-indigo-300 mr-2"
          style={{fontFamily: monospace}}>
          {displayAuthor(message.author_did)}
        </Text>
        <Text className="text-[10px] text-slate-500">
          {formatTimestamp(message.server_inserted_at)}
        </Text>
      </View>
      <Text className="text-sm text-slate-100 mt-1">{message.body}</Text>
    </View>
  );
}

export function ChannelScreen({
  serverUrl,
  serverLabel,
  channelId,
  channelName,
  onBack,
}: Props) {
  const {status, errorMessage, messages, send} = useChannel(serverUrl, channelId);
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

  return (
    <View testID="channel-screen" className="flex-1 bg-slate-900">
      <View className="px-4 py-3 border-b border-slate-800 flex-row items-center">
        <Pressable
          testID="channel-back-button"
          accessibilityRole="button"
          accessibilityLabel="back"
          onPress={onBack}
          className="mr-3 px-2 py-1 rounded-md bg-slate-800 active:bg-slate-700">
          <Text className="text-slate-200 text-sm">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-base font-semibold text-slate-50">
            #{channelName}
          </Text>
          <Text className="text-xs text-slate-400">{serverLabel}</Text>
        </View>
        <Text
          testID="channel-status"
          className={
            status === 'joined'
              ? 'text-xs text-emerald-400'
              : status === 'error'
                ? 'text-xs text-rose-400'
                : 'text-xs text-slate-400'
          }>
          {status}
        </Text>
      </View>

      {errorMessage ? (
        <View
          testID="channel-error"
          className="px-4 py-2 bg-rose-950/60 border-b border-rose-900">
          <Text className="text-xs text-rose-200">{errorMessage}</Text>
        </View>
      ) : null}

      <ScrollView
        testID="channel-message-list"
        ref={ref => {
          scrollRef.current = ref;
        }}
        className="flex-1"
        contentContainerStyle={{paddingVertical: 8}}>
        {messages.map(message => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ScrollView>

      <View className="px-3 py-2 border-t border-slate-800 flex-row items-center bg-slate-950">
        <TextInput
          testID="channel-message-input"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          editable={status === 'joined'}
          placeholder={
            status === 'joined' ? `Message #${channelName}` : 'Connecting…'
          }
          placeholderTextColor="#64748b"
          className="flex-1 px-3 py-2 rounded-md bg-slate-800 text-slate-100"
        />
        <Pressable
          testID="channel-message-send"
          accessibilityRole="button"
          accessibilityLabel="send message"
          onPress={handleSend}
          disabled={status !== 'joined' || draft.trim().length === 0}
          className="ml-2 px-4 py-2 rounded-md bg-indigo-600 active:bg-indigo-500 disabled:opacity-50">
          <Text className="text-slate-50 font-semibold">Send</Text>
        </Pressable>
      </View>
    </View>
  );
}
