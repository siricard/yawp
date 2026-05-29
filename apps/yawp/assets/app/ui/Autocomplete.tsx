import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';

import {Input, type InputProps} from './Input';
import {tokens} from './tokens';

export type AutocompleteProps = Omit<InputProps, 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  maxVisible?: number;
  inputTestID?: string;
  overlayTestID?: string;
  optionTestID?: (suggestion: string, index: number) => string;
};

export const Autocomplete = React.forwardRef<TextInput, AutocompleteProps>(
  function Autocomplete(
    {
      value,
      onChangeText,
      suggestions,
      onSelect,
      maxVisible = 6,
      inputTestID,
      overlayTestID = 'autocomplete-overlay',
      optionTestID,
      ...inputProps
    },
    ref,
  ) {
  const [focused, setFocused] = React.useState(false);
  const visible = focused && suggestions.length > 0;
  const shown = suggestions.slice(0, maxVisible);

  return (
    <View style={{position: 'relative'}}>
      <Input
        {...inputProps}
        ref={ref}
        testID={inputTestID}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 100)}
      />
      {visible ? (
        <View
          testID={overlayTestID}
          accessibilityLabel="autocomplete suggestions"
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: Platform.OS === 'web' ? 50 : undefined,
            elevation: 8,
          }}
          className="bg-surface rounded-md border border-border-soft">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{maxHeight: 240}}>
            {shown.map((s, i) => (
              <Pressable
                key={`${s}-${i}`}
                testID={optionTestID ? optionTestID(s, i) : `autocomplete-option-${i}`}
                accessibilityRole="button"
                onPress={() => {
                  onSelect(s);
                  setFocused(false);
                }}
                style={state => [
                  styles.option,
                  (state.pressed ||
                    (state as {hovered?: boolean}).hovered) &&
                    styles.optionHighlighted,
                ]}>
                <Text className="text-text text-sm font-mono">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
  },
);

// The selected/hover highlight is the row's OWN background (a StyleSheet style
// applied from Pressable's pressed/hovered state) rather than a separately
// measured floating bar. A measured absolute bar drifted and oversized on
// RN-macOS where row layout timing differs; a per-row background can never
// detach from or exceed the row it paints.
const styles = StyleSheet.create({
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionHighlighted: {
    backgroundColor: tokens.color.surface2,
  },
});
