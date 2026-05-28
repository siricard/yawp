import React from 'react';
import {ActivityIndicator, View} from 'react-native';

export type SpinnerProps = {
  size?: 'small' | 'large';
  color?: string;
  testID?: string;
};

export function Spinner({
  size = 'small',
  color = '#d8ee4d',
  testID = 'spinner',
}: SpinnerProps) {
  return (
    <View testID={testID} accessibilityLabel="loading">
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}
