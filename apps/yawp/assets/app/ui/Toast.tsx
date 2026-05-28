import React from 'react';
import {Text, View} from 'react-native';

export type ToastKind = 'info' | 'success' | 'danger';

export type ToastProps = {
  message: string;
  kind?: ToastKind;
  testID?: string;
};

const KIND_TEXT: Record<ToastKind, string> = {
  info: 'text-text',
  success: 'text-success',
  danger: 'text-danger',
};

export function Toast({message, kind = 'info', testID = 'toast'}: ToastProps) {
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`toast ${message}`}
      className="bg-surface-2 rounded-pill px-3 py-2 self-center"
      style={{
        shadowColor: '#08111a',
        shadowOffset: {width: 0, height: 14},
        shadowOpacity: 0.42,
        shadowRadius: 40,
        elevation: 6,
      }}>
      <Text className={`text-sm ${KIND_TEXT[kind]}`}>{message}</Text>
    </View>
  );
}
