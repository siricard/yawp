import React from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {Input, type InputProps} from './Input';

export type AutocompleteProps = Omit<InputProps, 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  maxVisible?: number;
  inputTestID?: string;
  overlayTestID?: string;
};

export function Autocomplete({
  value,
  onChangeText,
  suggestions,
  onSelect,
  maxVisible = 6,
  inputTestID,
  overlayTestID = 'autocomplete-overlay',
  ...inputProps
}: AutocompleteProps) {
  const [focused, setFocused] = React.useState(false);
  const visible = focused && suggestions.length > 0;
  const shown = suggestions.slice(0, maxVisible);

  return (
    <View style={{position: 'relative'}}>
      <Input
        {...inputProps}
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
                testID={`autocomplete-option-${i}`}
                accessibilityRole="button"
                onPress={() => {
                  onSelect(s);
                  setFocused(false);
                }}
                className="px-3 py-2 active:bg-surface-2">
                <Text className="text-text text-sm font-mono">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
