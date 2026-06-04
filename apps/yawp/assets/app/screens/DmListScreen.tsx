import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {useAnchorStatus} from '../chat/anchor-connection';
import {
  appendDmItem,
  decideDmSend,
  flushQueued,
  hasQueued,
  type DmOutboxItem,
} from '../chat/dm-outbox';
import {Banner, Button, Input} from '../ui';
import {pointerCursor} from '../ui/cursor';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function DmListScreen({onBack}: {onBack: () => void}) {
  const {degraded} = useAnchorStatus();
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<DmOutboxItem[]>([]);
  const seq = useRef(0);
  const wasDegraded = useRef(degraded);

  useEffect(() => {
    if (wasDegraded.current && !degraded) {
      setItems(prev => (hasQueued(prev) ? flushQueued(prev) : prev));
    }
    wasDegraded.current = degraded;
  }, [degraded]);

  function handleSend() {
    const decision = decideDmSend(draft, degraded);
    if (!decision.accepted && decision.reason === 'empty') return;
    seq.current += 1;
    const item: DmOutboxItem = {
      id: `dm-${seq.current}`,
      body: draft.trim(),
      delivery: decision.accepted ? 'sent' : 'queued',
    };
    setItems(prev => appendDmItem(prev, item));
    setDraft('');
  }

  return (
    <View testID="dm-list-screen" className="flex-1 bg-bg">
      <View className="px-6 py-3 border-b border-border-soft flex-row items-center bg-surface">
        <Pressable
          testID="dm-back-button"
          accessibilityRole="button"
          accessibilityLabel="back"
          onPress={onBack}
          style={pointerCursor}
          className="mr-3 w-8 h-8 rounded-pill bg-surface-2 active:bg-surface-3 items-center justify-center">
          <Text className="text-text-secondary text-sm">‹</Text>
        </Pressable>
        <Text className="text-base font-bold text-text">
          <Text className="text-primary" style={{fontFamily: monospace}}>
            @
          </Text>{' '}
          Direct messages
        </Text>
      </View>

      <View className="flex-1 px-6 py-4">
        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-text-secondary text-sm text-center">
              No direct messages yet.
            </Text>
            <Text className="text-text-tertiary text-xs text-center mt-1">
              Conversations you start will show up here.
            </Text>
          </View>
        ) : (
          <View testID="dm-message-list" style={{gap: 8}}>
            {items.map(item => (
              <View
                key={item.id}
                testID={`dm-message-${item.id}`}
                className="bg-surface-2 rounded-md px-3 py-2">
                <Text className="text-sm text-text">{item.body}</Text>
                {item.delivery === 'queued' ? (
                  <Text
                    testID={`dm-queued-indicator-${item.id}`}
                    className="text-xs text-warning mt-1">
                    Queued — will send when you reconnect
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="px-6 pb-4 pt-2 border-t border-border-soft bg-surface">
        {degraded ? (
          <View className="mb-2">
            <Banner
              testID="dm-degraded-notice"
              kind="warning"
              message="You're offline. New messages stay on this device and send when you reconnect."
            />
          </View>
        ) : null}
        <View className="flex-row items-end" style={{gap: 8}}>
          <View className="flex-1">
            <Input
              testID="dm-composer-input"
              variant="textarea"
              placeholder="Write a message"
              value={draft}
              onChangeText={setDraft}
            />
          </View>
          <Button
            testID="dm-send-button"
            label={degraded ? 'Queue' : 'Send'}
            onPress={handleSend}
            disabled={draft.trim().length === 0}
          />
        </View>
      </View>
    </View>
  );
}
