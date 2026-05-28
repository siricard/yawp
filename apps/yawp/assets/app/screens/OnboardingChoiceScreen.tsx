
import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

type Props = {
  onCreate: () => void;
  onRestore: () => void;
};

export function OnboardingChoiceScreen({onCreate, onRestore}: Props) {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-choice-screen"
      testID="onboarding-choice-screen">
      <Text className="text-3xl font-bold text-text mb-2">
        Welcome to Yawp
      </Text>
      <Text className="text-sm text-text-secondary mb-8">
        Yawp is end-to-end encrypted. Your identity is a 12-word phrase that
        only ever lives on your devices.
      </Text>

      <Pressable
        testID="choice-create-btn"
        accessibilityRole="button"
        accessibilityLabel="create new identity"
        onPress={onCreate}
        className="rounded-lg py-4 px-4 bg-primary active:bg-primary-hover mb-4">
        <Text className="text-base font-semibold text-on-primary mb-1">
          Create new identity
        </Text>
        <Text className="text-xs text-on-primary/80">
          We&rsquo;ll generate a fresh 12-word recovery phrase. You back it
          up; we never see it.
        </Text>
      </Pressable>

      <Pressable
        testID="choice-restore-btn"
        accessibilityRole="button"
        accessibilityLabel="restore from recovery phrase"
        onPress={onRestore}
        className="rounded-lg py-4 px-4 border border-border-soft active:bg-surface">
        <Text className="text-base font-semibold text-text mb-1">
          Restore from recovery phrase
        </Text>
        <Text className="text-xs text-text-secondary">
          Type your 12 words from a previous device. We&rsquo;ll re-derive
          your identity locally.
        </Text>
      </Pressable>

      <View className="mt-8">
        <Text className="text-xs text-text-tertiary">
          Lost both your phrase and your devices? Recovery isn&rsquo;t
          possible yet.
        </Text>
      </View>
    </ScrollView>
  );
}
