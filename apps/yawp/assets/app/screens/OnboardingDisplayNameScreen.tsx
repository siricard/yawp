
import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

type Props = {
  defaultDisplayName: string;
  /**
   * Called when the user confirms. Receives the override (trimmed) or
   * `null` when the user kept the default unchanged.
   */
  onSubmit: (override: string | null) => void;
};

export function OnboardingDisplayNameScreen({
  defaultDisplayName,
  onSubmit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [override, setOverride] = useState(defaultDisplayName);

  const trimmedOverride = override.trim();
  const effective = editing ? trimmedOverride : defaultDisplayName;
  const canSubmit = effective.length > 0;

  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-display-name-screen"
      testID="onboarding-display-name-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Pick a display name
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        This is how others in your workspaces will see you. We picked one for
        you — feel free to change it.
      </Text>

      {editing ? (
        <View className="mb-6">
          <TextInput
            testID="display-name-input"
            accessibilityLabel="display name"
            value={override}
            onChangeText={setOverride}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Your display name"
            placeholderTextColor="#64748b"
            className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
            style={{fontFamily: monospace}}
          />
        </View>
      ) : (
        <View
          testID="display-name-default"
          accessibilityLabel="default display name"
          className="bg-slate-800 rounded-lg px-4 py-4 mb-4 flex-row items-center justify-between">
          <Text className="text-lg text-slate-50">{defaultDisplayName}</Text>
          <Pressable
            testID="display-name-change-btn"
            accessibilityRole="button"
            accessibilityLabel="change display name"
            onPress={() => setEditing(true)}
            className="rounded-lg py-1 px-3 bg-slate-700 border border-slate-600 active:bg-slate-600">
            <Text className="text-xs font-semibold text-slate-50">Change</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        testID="display-name-submit-btn"
        accessibilityRole="button"
        accessibilityLabel="continue"
        accessibilityState={{disabled: !canSubmit}}
        disabled={!canSubmit}
        onPress={() => {
          if (editing && trimmedOverride !== defaultDisplayName) {
            onSubmit(trimmedOverride);
          } else {
            onSubmit(null);
          }
        }}
        className={[
          'rounded-lg py-3 px-4 self-start',
          canSubmit
            ? 'bg-indigo-500 active:bg-indigo-400'
            : 'bg-slate-700 opacity-60',
        ].join(' ')}>
        <Text className="text-sm font-semibold text-slate-50">Continue</Text>
      </Pressable>
    </ScrollView>
  );
}
