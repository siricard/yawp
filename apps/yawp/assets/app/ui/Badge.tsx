import React from 'react';
import {Text, View} from 'react-native';

export type BadgeTone = 'primary' | 'muted' | 'danger' | 'success';

export type BadgeProps = {
  count?: number;
  label?: string;
  tone?: BadgeTone;
  testID?: string;
};

const TONE_BG: Record<BadgeTone, string> = {
  primary: 'bg-primary',
  muted: 'bg-surface-3',
  danger: 'bg-danger',
  success: 'bg-success',
};

const TONE_TEXT: Record<BadgeTone, string> = {
  primary: 'text-on-primary',
  muted: 'text-text',
  danger: 'text-white',
  success: 'text-on-primary',
};

export function Badge({count, label, tone = 'primary', testID}: BadgeProps) {
  const display = label ?? (count !== undefined ? String(count) : '');
  return (
    <View
      testID={testID}
      accessibilityLabel={`badge ${display}`}
      className={`rounded-pill px-sm ${TONE_BG[tone]}`}
      style={{minWidth: 18, alignItems: 'center', justifyContent: 'center'}}>
      <Text
        className={`text-xs font-bold font-mono ${TONE_TEXT[tone]}`}>
        {display}
      </Text>
    </View>
  );
}
