import React from 'react';
import {Text, View} from 'react-native';

export type FieldProps = {
  label?: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
  testID?: string;
};

export function Field({label, helper, error, children, testID}: FieldProps) {
  return (
    <View testID={testID} className="mb-3">
      {label ? (
        <Text
          className="text-xs font-semibold text-text-secondary mb-1 uppercase"
          accessibilityLabel={label}>
          {label}
        </Text>
      ) : null}
      <View>{children}</View>
      {error ? (
        <Text
          testID={testID ? `${testID}-error` : undefined}
          className="text-xs text-danger mt-1">
          {error}
        </Text>
      ) : helper ? (
        <Text
          testID={testID ? `${testID}-helper` : undefined}
          className="text-xs text-text-tertiary mt-1">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
