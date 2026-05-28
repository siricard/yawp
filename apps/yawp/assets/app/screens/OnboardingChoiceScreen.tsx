
import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

type Props = {
  onCreate: () => void;
  onRestore: () => void;
};

export function OnboardingChoiceScreen({onCreate, onRestore}: Props) {
  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-choice-screen"
      testID="onboarding-choice-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Welcome to Yawp
      </Text>
      <Text className="text-sm text-slate-400 mb-8">
        Yawp is end-to-end encrypted. Your identity is a 12-word phrase that
        only ever lives on your devices.
      </Text>

      <Pressable
        testID="choice-create-btn"
        accessibilityRole="button"
        accessibilityLabel="create new identity"
        onPress={onCreate}
        className="rounded-lg py-4 px-4 bg-indigo-500 active:bg-indigo-400 mb-4">
        <Text className="text-base font-semibold text-slate-50 mb-1">
          Create new identity
        </Text>
        <Text className="text-xs text-indigo-100">
          We&rsquo;ll generate a fresh 12-word recovery phrase. You back it
          up; we never see it.
        </Text>
      </Pressable>

      <Pressable
        testID="choice-restore-btn"
        accessibilityRole="button"
        accessibilityLabel="restore from recovery phrase"
        onPress={onRestore}
        className="rounded-lg py-4 px-4 border border-slate-700 active:bg-slate-800">
        <Text className="text-base font-semibold text-slate-100 mb-1">
          Restore from recovery phrase
        </Text>
        <Text className="text-xs text-slate-400">
          Type your 12 words from a previous device. We&rsquo;ll re-derive
          your identity locally.
        </Text>
      </Pressable>

      <View className="mt-8">
        <Text className="text-xs text-slate-500">
          Lost both your phrase and your devices? Recovery isn&rsquo;t
          possible yet.
        </Text>
      </View>
    </ScrollView>
  );
}
