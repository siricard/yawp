import React from 'react';
import {Pressable, View, type ViewProps} from 'react-native';

export type CardVariant = 'default' | 'elevated' | 'interactive';

export type CardProps = ViewProps & {
  variant?: CardVariant;
  onPress?: () => void;
  children?: React.ReactNode;
};

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'bg-surface',
  elevated: 'bg-surface',
  interactive: 'bg-surface active:bg-surface-2',
};

export function Card({
  variant = 'default',
  onPress,
  children,
  testID,
  accessibilityLabel,
  style,
  ...rest
}: CardProps) {
  const className = `rounded-lg p-lg ${VARIANT_CLASSES[variant]}`;
  const elevatedStyle =
    variant === 'elevated'
      ? {
          shadowColor: '#08111a',
          shadowOffset: {width: 0, height: 6},
          shadowOpacity: 0.28,
          shadowRadius: 22,
          elevation: 6,
        }
      : undefined;
  const combined = [elevatedStyle, style].filter(Boolean) as ViewProps['style'];

  if (variant === 'interactive' || onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        className={className}
        style={combined}>
        {children}
      </Pressable>
    );
  }
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      className={className}
      style={combined}
      {...rest}>
      {children}
    </View>
  );
}
