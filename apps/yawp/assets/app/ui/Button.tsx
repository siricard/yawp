import React from 'react';
import {Pressable, Text, View, type PressableProps} from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  block?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  iconOnly?: React.ReactNode;
  onPress?: PressableProps['onPress'];
  testID?: string;
  accessibilityLabel?: string;
  accessibilityState?: PressableProps['accessibilityState'];
  children?: React.ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary active:bg-primary-hover',
  secondary: 'bg-surface-2 active:bg-surface-3',
  ghost: 'bg-transparent active:bg-surface-2',
  danger: 'bg-danger active:opacity-90',
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: 'text-on-primary',
  secondary: 'text-text',
  ghost: 'text-text',
  danger: 'text-white',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-2',
  lg: 'px-6 py-3',
};

const SIZE_TEXT: Record<ButtonSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  block = false,
  iconLeft,
  iconRight,
  iconOnly,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityState,
  children,
}: ButtonProps) {
  const isIconOnly = iconOnly !== undefined;
  const baseClass = [
    'rounded-pill items-center justify-center flex-row',
    VARIANT_CLASSES[variant],
    isIconOnly ? 'px-2 py-2' : SIZE_CLASSES[size],
    block ? 'w-full' : '',
    disabled ? 'opacity-50' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={accessibilityState ?? {disabled}}
      disabled={disabled}
      onPress={onPress}
      className={baseClass}>
      {isIconOnly ? (
        iconOnly
      ) : (
        <>
          {iconLeft ? <View className="mr-2">{iconLeft}</View> : null}
          {label !== undefined || children !== undefined ? (
            <Text
              className={`font-semibold ${VARIANT_TEXT[variant]} ${SIZE_TEXT[size]}`}>
              {label ?? children}
            </Text>
          ) : null}
          {iconRight ? <View className="ml-2">{iconRight}</View> : null}
        </>
      )}
    </Pressable>
  );
}
