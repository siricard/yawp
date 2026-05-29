
import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

import {Banner} from '../ui/Banner';

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
  /**
   * Set when persisting the identity to secure storage failed. Surfaced as
   * a banner so a rejected keychain write doesn't leave the button looking
   * inert.
   */
  error?: string | null;
};

export function OnboardingDisplayNameScreen({
  defaultDisplayName,
  onSubmit,
  error = null,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [override, setOverride] = useState(defaultDisplayName);

  const trimmedOverride = override.trim();
  const effective = editing ? trimmedOverride : defaultDisplayName;
  const canSubmit = effective.length > 0;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-display-name-screen"
      testID="onboarding-display-name-screen">
      <Text className="text-3xl font-bold text-text mb-2">
        Pick a display name
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
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
            placeholderTextColor="#7a8290"
            className="bg-surface text-text rounded-lg px-3 py-2 border border-border-soft"
            style={{fontFamily: monospace}}
          />
        </View>
      ) : (
        <View
          testID="display-name-default"
          accessibilityLabel="default display name"
          className="bg-surface rounded-lg px-4 py-4 mb-4 flex-row items-center justify-between">
          <Text className="text-lg text-text">{defaultDisplayName}</Text>
          <Pressable
            testID="display-name-change-btn"
            accessibilityRole="button"
            accessibilityLabel="change display name"
            onPress={() => setEditing(true)}
            className="rounded-lg py-1 px-3 bg-surface-2 border border-border-soft active:bg-surface-3">
            <Text className="text-xs font-semibold text-text">Change</Text>
          </Pressable>
        </View>
      )}

      {error ? (
        <View className="mb-4">
          <Banner
            kind="danger"
            title="Couldn't save your identity"
            testID="display-name-error"
            message={error}
          />
        </View>
      ) : null}

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
            ? 'bg-primary active:bg-primary-hover'
            : 'bg-surface-2 opacity-60',
        ].join(' ')}>
        <Text className="text-sm font-semibold text-on-primary">Continue</Text>
      </Pressable>
    </ScrollView>
  );
}
