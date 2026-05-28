import React from 'react';
import {Text, View} from 'react-native';

export type PillTone =
  | 'default'
  | 'primary'
  | 'verified'
  | 'warning'
  | 'danger';

export type PillProps = {
  label: string;
  tone?: PillTone;
  icon?: React.ReactNode;
  testID?: string;
};

const TONE: Record<PillTone, {bg: string; text: string}> = {
  default: {bg: 'bg-surface-2', text: 'text-text-secondary'},
  primary: {bg: 'bg-primary/20', text: 'text-primary'},
  verified: {bg: 'bg-success/20', text: 'text-success'},
  warning: {bg: 'bg-warning/20', text: 'text-warning'},
  danger: {bg: 'bg-danger/20', text: 'text-danger'},
};

export function Pill({label, tone = 'default', icon, testID}: PillProps) {
  const t = TONE[tone];
  return (
    <View
      testID={testID}
      accessibilityLabel={`pill ${label}`}
      className={`rounded-pill px-sm flex-row items-center ${t.bg}`}
      style={{paddingVertical: 3, paddingHorizontal: 9}}>
      {icon ? <View className="mr-xs">{icon}</View> : null}
      <Text className={`text-xs font-semibold ${t.text}`}>{label}</Text>
    </View>
  );
}
