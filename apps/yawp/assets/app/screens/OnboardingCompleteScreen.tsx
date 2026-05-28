
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
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-complete-screen"
      testID="onboarding-complete-screen">
      <Text className="text-3xl font-bold text-text mb-2">
        You&apos;re all set
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
        Your identity is ready to use on this device.
      </Text>

      <View className="bg-surface rounded-lg p-4 mb-3">
        <Text className="text-xs text-text-secondary mb-1">Display name</Text>
        <Text testID="complete-display-name" className="text-base text-text">
          {displayName}
        </Text>
      </View>

      <View className="bg-surface rounded-lg p-4 mb-6">
        <Text className="text-xs text-text-secondary mb-1">Fingerprint</Text>
        <Text
          testID="complete-fingerprint"
          className="text-sm text-text"
          selectable>
          {fingerprint}
        </Text>
      </View>

      <Pressable
        testID="complete-go-home-btn"
        accessibilityRole="button"
        accessibilityLabel="go to home"
        onPress={onGoHome}
        className="rounded-lg py-3 px-4 self-start bg-primary active:bg-primary-hover">
        <Text className="text-sm font-semibold text-on-primary">Go to home</Text>
      </Pressable>
    </ScrollView>
  );
}
