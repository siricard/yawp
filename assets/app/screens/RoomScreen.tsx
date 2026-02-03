
import React, {useEffect, useRef, useState} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {useRoom} from '../chat';

type Props = {
  roomId: string;
  onBack: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function RoomScreen({roomId, onBack}: Props) {
  const {status, messages, sendMessage, unauthenticated} = useRoom(roomId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({animated: false});
    });
  }, [messages]);

  async function handleSend() {
    if (!draft.trim() || sending || unauthenticated) {
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await sendMessage(draft);
    setSending(false);
    if (result.ok) {
      setDraft('');
    } else {
      setSendError(result.reason);
    }
  }

  let statusBanner: string | null = null;
  switch (status.status) {
    case 'idle':
      statusBanner = 'Idle';
      break;
    case 'joining':
      statusBanner = 'Joining room…';
      break;
    case 'joined':
      statusBanner = null;
      break;
    case 'error':
      statusBanner = `Join error: ${status.reason}`;
      break;
  }

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="room-screen">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-2xl font-bold text-slate-50">
          Room {roomId.slice(0, 8)}…
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          testID="room-back-button"
          className="bg-slate-700 border border-slate-600 rounded px-3 py-1 active:bg-slate-600">
          <Text className="text-xs text-slate-50">Back</Text>
        </Pressable>
      </View>

      {statusBanner ? (
        <Text
          className="text-xs text-amber-300 mb-2"
          testID="room-status"
          nativeID="room-status">
          {statusBanner}
        </Text>
      ) : null}

      {unauthenticated ? (
        <Text
          className="text-xs text-rose-300 mb-2"
          testID="room-unauth"
          nativeID="room-unauth">
          You're not authenticated. Go back and authenticate first.
        </Text>
      ) : null}

      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-slate-800 rounded-lg p-3 mb-4"
        testID="message-list"
        nativeID="message-list">
        {messages.length === 0 ? (
          <Text className="text-slate-500 text-sm">
            No messages yet. Say hello.
          </Text>
        ) : (
          messages.map(msg => (
            <View
              key={msg.id}
              testID={`message-${msg.id}`}
              nativeID={`message-${msg.id}`}
              className="mb-2 pb-2 border-b border-slate-700">
              <Text
                className="text-[10px] text-slate-500 mb-1"
                style={{fontFamily: monospace}}>
                {msg.senderDid.slice(0, 12)}… ·{' '}
                {new Date(msg.insertedAt).toLocaleTimeString()}
              </Text>
              <Text
                className="text-sm text-slate-50"
                selectable>
                {msg.content}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {sendError ? (
        <Text
          className="text-xs text-rose-300 mb-2"
          testID="send-error"
          nativeID="send-error">
          {sendError}
        </Text>
      ) : null}

      <View className="flex-row items-center">
        <TextInput
          className="flex-1 border border-slate-600 rounded px-3 py-2 text-slate-50 mr-2"
          placeholder={
            unauthenticated ? 'Authenticate to send' : 'Type a message'
          }
          placeholderTextColor="#64748b"
          value={draft}
          onChangeText={setDraft}
          editable={!unauthenticated && !sending}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error rn-web passes through `disabled` to the input.
          disabled={unauthenticated || sending}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          testID="message-input"
          nativeID="message-input"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleSend}
          disabled={unauthenticated || sending || !draft.trim()}
          testID="send-button"
          nativeID="send-button"
          className={`rounded py-2 px-4 ${
            unauthenticated || sending || !draft.trim()
              ? 'bg-slate-700 opacity-50'
              : 'bg-emerald-600 active:bg-emerald-500'
          }`}>
          <Text className="text-sm font-semibold text-white">
            {sending ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
