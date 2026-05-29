import React from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

export type InputVariant = 'text' | 'password' | 'textarea';

export type InputProps = Omit<TextInputProps, 'style'> & {
  variant?: InputVariant;
  error?: boolean;
  rightSlot?: React.ReactNode;
  containerStyle?: ViewStyle;
  testID?: string;
};

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  {
    variant = 'text',
    error = false,
    rightSlot,
    containerStyle,
    testID,
    ...rest
  },
  ref,
) {
  const isTextarea = variant === 'textarea';
  const secure = variant === 'password';
  return (
    <View
      className={[
        'flex-row items-center bg-surface-2',
        isTextarea ? 'rounded-md py-3 px-3' : 'rounded-md px-3 py-2',
        error ? 'border border-danger' : 'border border-transparent',
      ].join(' ')}
      style={containerStyle}>
      <TextInput
        ref={ref}
        testID={testID}
        secureTextEntry={secure}
        multiline={isTextarea}
        placeholderTextColor="#7a8290"
        className="flex-1 text-text text-sm"
        style={
          isTextarea
            ? {minHeight: 96, textAlignVertical: 'top', color: '#f0efea'}
            : {color: '#f0efea'}
        }
        {...rest}
      />
      {rightSlot ? <View className="ml-2">{rightSlot}</View> : null}
    </View>
  );
});
