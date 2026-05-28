
import React, {useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {Button, Field, Input} from '../ui';

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

  const feedbackColor =
    feedback.tone === 'ok'
      ? 'text-success'
      : feedback.tone === 'warn'
        ? 'text-warning'
        : 'text-text-tertiary';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-passphrase-screen"
      testID="onboarding-passphrase-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Protect this device (optional)
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
        Add a passphrase to encrypt your identity on this device. You will need
        it every time you load Yawp here. Skip if you don&apos;t want one yet —
        you can add it later in settings.
      </Text>

      <Field label="Passphrase">
        <Input
          testID="passphrase-input"
          accessibilityLabel="passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          autoCapitalize="none"
          autoCorrect={false}
          variant="password"
          placeholder="At least 8 characters"
        />
      </Field>

      <Field label="Confirm passphrase">
        <Input
          testID="passphrase-confirm-input"
          accessibilityLabel="confirm passphrase"
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          variant="password"
          placeholder="Repeat your passphrase"
        />
      </Field>

      <Text
        testID="passphrase-feedback"
        className={`text-xs mb-6 ${feedbackColor}`}>
        {feedback.text}
      </Text>

      <View className="flex-row" style={{gap: 12}}>
        <Button
          testID="passphrase-submit-btn"
          accessibilityLabel="use passphrase"
          variant="primary"
          size="md"
          disabled={!canSubmit}
          label="Use this passphrase"
          onPress={() => onSubmit({passphrase})}
        />
        <Button
          testID="passphrase-skip-btn"
          accessibilityLabel="skip passphrase"
          variant="secondary"
          size="md"
          label="Skip for now"
          onPress={() => onSubmit({passphrase: null})}
        />
      </View>
    </ScrollView>
  );
}
