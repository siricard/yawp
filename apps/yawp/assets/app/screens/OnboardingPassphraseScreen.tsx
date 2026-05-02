
import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const MIN_PASSPHRASE_LENGTH = 8;

type Props = {
  onSubmit: (result: {passphrase: string | null}) => void;
};

export function OnboardingPassphraseScreen({onSubmit}: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');

  const longEnough = passphrase.length >= MIN_PASSPHRASE_LENGTH;
  const matches = passphrase.length > 0 && passphrase === confirm;
  const canSubmit = longEnough && matches;

  let feedback: {text: string; tone: 'neutral' | 'ok' | 'warn'} = {
    text: `At least ${MIN_PASSPHRASE_LENGTH} characters.`,
    tone: 'neutral',
  };
  if (passphrase.length > 0 && !longEnough) {
    feedback = {
      text: `Too short — needs at least ${MIN_PASSPHRASE_LENGTH} characters.`,
      tone: 'warn',
    };
  } else if (longEnough && !matches && confirm.length > 0) {
    feedback = {text: 'Passphrase and confirmation do not match.', tone: 'warn'};
  } else if (canSubmit) {
    feedback = {text: 'Looks good.', tone: 'ok'};
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-passphrase-screen"
      testID="onboarding-passphrase-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Protect this device (optional)
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        Add a passphrase to encrypt your identity on this device. You will need
        it every time you load Yawp here. Skip if you don&apos;t want one yet —
        you can add it later in settings.
      </Text>

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          Passphrase
        </Text>
        <TextInput
          testID="passphrase-input"
          accessibilityLabel="passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="At least 8 characters"
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
        />
      </View>

      <View className="mb-2">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          Confirm passphrase
        </Text>
        <TextInput
          testID="passphrase-confirm-input"
          accessibilityLabel="confirm passphrase"
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Repeat your passphrase"
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
        />
      </View>

      <Text
        testID="passphrase-feedback"
        className={[
          'text-xs mb-6',
          feedback.tone === 'ok'
            ? 'text-emerald-300'
            : feedback.tone === 'warn'
              ? 'text-amber-300'
              : 'text-slate-400',
        ].join(' ')}>
        {feedback.text}
      </Text>

      <View className="flex-row gap-3">
        <Pressable
          testID="passphrase-submit-btn"
          accessibilityRole="button"
          accessibilityLabel="use passphrase"
          accessibilityState={{disabled: !canSubmit}}
          disabled={!canSubmit}
          onPress={() => onSubmit({passphrase})}
          className={[
            'rounded-lg py-2 px-4',
            canSubmit
              ? 'bg-indigo-500 active:bg-indigo-400'
              : 'bg-slate-700 opacity-60',
          ].join(' ')}>
          <Text className="text-sm font-semibold text-slate-50">
            Use this passphrase
          </Text>
        </Pressable>

        <Pressable
          testID="passphrase-skip-btn"
          accessibilityRole="button"
          accessibilityLabel="skip passphrase"
          onPress={() => onSubmit({passphrase: null})}
          className="rounded-lg py-2 px-4 bg-slate-700 border border-slate-600 active:bg-slate-600">
          <Text className="text-sm font-semibold text-slate-50">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
