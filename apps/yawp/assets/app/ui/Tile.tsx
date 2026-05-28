import React from 'react';
import {Pressable, Text, View} from 'react-native';

export type TileProps = {
  label: string;
  active?: boolean;
  add?: boolean;
  unread?: boolean;
  mention?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

function initial(label: string): string {
  const c = label.replace(/^https?:\/\//, '').trim();
  return c.charAt(0).toUpperCase() || '?';
}

export function Tile({
  label,
  active = false,
  add = false,
  unread = false,
  mention = false,
  onPress,
  testID,
  accessibilityLabel,
}: TileProps) {
  const baseStyle = {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const className = [
    add
      ? 'bg-transparent border border-dashed border-border-soft'
      : active
        ? 'bg-surface border border-primary'
        : 'bg-surface-2 active:bg-surface-3',
  ].join(' ');

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `tile ${label}`}
      accessibilityState={{selected: active}}
      onPress={onPress}
      className={className}
      style={baseStyle}>
      <Text className="text-sm font-bold text-text font-mono">
        {add ? '+' : initial(label)}
      </Text>
      {unread || mention ? (
        <View
          testID={testID ? `${testID}-dot` : undefined}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: '#202831',
            backgroundColor: mention ? '#e8615a' : '#d8ee4d',
          }}
        />
      ) : null}
    </Pressable>
  );
}
