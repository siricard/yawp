import React from 'react';
import {Text, View} from 'react-native';

export type SectionProps = {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  testID?: string;
};

export function Section({title, subtitle, children, testID}: SectionProps) {
  return (
    <View testID={testID} className="mb-2xl">
      {title || subtitle ? (
        <View className="flex-row items-end justify-between mb-md border-b border-border-soft pb-sm">
          {title ? (
            <Text className="text-lg font-bold text-text">{title}</Text>
          ) : (
            <View />
          )}
          {subtitle ? (
            <Text className="text-sm text-text-secondary">{subtitle}</Text>
          ) : null}
        </View>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

export type SubsectionProps = {
  label: string;
  children?: React.ReactNode;
  testID?: string;
};

export function Subsection({label, children, testID}: SubsectionProps) {
  return (
    <View testID={testID} className="mb-lg">
      <Text className="text-xs font-semibold text-text-secondary font-mono uppercase mb-sm">
      </Text>
      <View>{children}</View>
    </View>
  );
}
