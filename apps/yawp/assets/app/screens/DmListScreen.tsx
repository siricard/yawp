import React from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {pointerCursor} from '../ui/cursor';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function DmListScreen({onBack}: {onBack: () => void}) {
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

      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text-secondary text-sm text-center">
          No direct messages yet.
        </Text>
        <Text className="text-text-tertiary text-xs text-center mt-1">
          Conversations you start will show up here.
        </Text>
      </View>
    </View>
  );
}
