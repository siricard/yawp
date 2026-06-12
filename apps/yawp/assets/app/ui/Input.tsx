import React from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {tokens} from './tokens';

export type InputVariant = 'text' | 'password' | 'textarea';

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

// `outlineStyle` is a react-native-web-only property absent from RN's TextStyle.
const noFocusOutline = {outlineStyle: 'none'} as unknown as TextStyle;

// Opts password fields out of password-manager capture (1Password, LastPass,
// Bitwarden). react-native-web maps `dataSet` keys to `data-*` DOM attributes;
// native RN ignores `dataSet`. `dataSet` is absent from RN's TextInputProps,
// hence the dedicated type.
const passwordManagerOptOut: Pick<TextInputProps, 'autoComplete'> & {
  dataSet: Record<string, string>;
} = {
  autoComplete: 'off',
  dataSet: {'1p-ignore': 'true', lpignore: 'true', bwignore: 'true'},
};

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
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const isTextarea = variant === 'textarea';
  const secure = variant === 'password';
  const [focused, setFocused] = React.useState(false);

  const handleFocus: FocusHandler = e => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur: BlurHandler = e => {
    setFocused(false);
    onBlur?.(e);
  };

  // Error always wins; otherwise a focused field gets the chartreuse focus
  // ring (matches v16's `--focus-ring` token applied to the field border).
  const showFocusRing = focused && !error;

  return (
    <View
      className={[
        'flex-row items-center bg-surface-2',
        isTextarea ? 'rounded-md py-3 px-3' : 'rounded-md px-3 py-2',
        error
          ? 'border border-danger'
          : showFocusRing
            ? 'border'
            : 'border border-transparent',
      ].join(' ')}
      style={[
        containerStyle,
        showFocusRing
          ? {borderColor: tokens.color.primary, boxShadow: tokens.misc.focusRing}
          : null,
      ]}>
      <TextInput
        ref={ref}
        testID={testID}
        secureTextEntry={secure}
        multiline={isTextarea}
        {...(secure ? passwordManagerOptOut : null)}
        placeholderTextColor="#7a8290"
        className="flex-1 text-text text-sm"
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          // Kill the default browser blue focus outline on react-native-web.
          // RN native ignores `outlineStyle` harmlessly.
          noFocusOutline,
          isTextarea
            ? {minHeight: 96, textAlignVertical: 'top', color: '#f0efea'}
            : {color: '#f0efea'},
        ]}
        {...rest}
      />
      {rightSlot ? <View className="ml-2">{rightSlot}</View> : null}
    </View>
  );
});
