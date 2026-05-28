import React from 'react';
import {Text, View} from 'react-native';

export type BannerKind = 'info' | 'warning' | 'success' | 'danger';

export type BannerProps = {
  kind?: BannerKind;
  title?: string;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  testID?: string;
};

const KIND_CONTAINER: Record<BannerKind, string> = {
  info: 'bg-surface-2 border border-border-soft',
  warning: 'bg-warning/20 border border-warning',
  success: 'bg-success/20 border border-success',
  danger: 'bg-danger/20 border border-danger',
};

const KIND_TITLE: Record<BannerKind, string> = {
  info: 'text-text',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
};

export function Banner({
  kind = 'info',
  title,
  message,
  icon,
  actions,
  testID,
}: BannerProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={title ? `${kind} ${title}` : `${kind} banner`}
      className={`rounded-md p-3 ${KIND_CONTAINER[kind]}`}>
      <View className="flex-row items-start">
        {icon ? <View className="mr-2 mt-1">{icon}</View> : null}
        <View className="flex-1">
          {title ? (
            <Text className={`text-sm font-bold mb-1 ${KIND_TITLE[kind]}`}>
              {title}
            </Text>
          ) : null}
          {typeof message === 'string' ? (
            <Text className="text-sm text-text-secondary">{message}</Text>
          ) : (
            message
          )}
        </View>
      </View>
      {actions ? (
        <View className="flex-row mt-3" style={{gap: 8}}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}
