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
    <View testID={testID} className="mb-8">
      {title || subtitle ? (
        <View className="flex-row items-end justify-between mb-3 border-b border-border-soft pb-2">
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
    <View testID={testID} className="mb-4">
      <Text className="text-xs font-semibold text-text-secondary font-mono uppercase mb-2">
      </Text>
      <View>{children}</View>
    </View>
  );
}
