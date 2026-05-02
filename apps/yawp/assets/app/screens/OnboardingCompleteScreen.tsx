
import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

type Props = {
  displayName: string;
  fingerprint: string;
  onGoHome: () => void;
};

export function OnboardingCompleteScreen({
  displayName,
  fingerprint,
  onGoHome,
}: Props) {
  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-complete-screen"
      testID="onboarding-complete-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        You&apos;re all set
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        Your identity is ready to use on this device.
      </Text>

      <View className="bg-slate-800 rounded-lg p-4 mb-3">
        <Text className="text-xs text-slate-400 mb-1">Display name</Text>
        <Text testID="complete-display-name" className="text-base text-slate-50">
          {displayName}
        </Text>
      </View>

      <View className="bg-slate-800 rounded-lg p-4 mb-6">
        <Text className="text-xs text-slate-400 mb-1">Fingerprint</Text>
        <Text
          testID="complete-fingerprint"
          className="text-sm text-slate-50"
          selectable>
          {fingerprint}
        </Text>
      </View>

      <Pressable
        testID="complete-go-home-btn"
        accessibilityRole="button"
        accessibilityLabel="go to home"
        onPress={onGoHome}
        className="rounded-lg py-3 px-4 self-start bg-indigo-500 active:bg-indigo-400">
        <Text className="text-sm font-semibold text-slate-50">Go to home</Text>
      </Pressable>
    </ScrollView>
  );
}
