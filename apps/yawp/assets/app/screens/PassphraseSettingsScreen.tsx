
import React, {useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {usePassphrase} from '../identity-context';
import {Button, Card, Field, Input} from '../ui';

const MIN_PASSPHRASE_LENGTH = 8;

type Props = {
  onBack: () => void;
};

export function PassphraseSettingsScreen({onBack}: Props) {
  const {sealed, changePassphrase} = usePassphrase();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const removingSeal = sealed && next.length === 0 && confirm.length === 0;
  const settingNew = next.length > 0;

  const nextOk = !settingNew || next.length >= MIN_PASSPHRASE_LENGTH;
  const matches = !settingNew || next === confirm;
  const currentProvided = !sealed || current.length > 0;
  const canSubmit =
    !pending && nextOk && matches && currentProvided && (removingSeal || settingNew);

  async function onSubmit() {
    setError(null);
    setDone(null);
    setPending(true);
    const result = await changePassphrase({
      current: sealed ? current : null,
      next: settingNew ? next : null,
    });
    setPending(false);
    if (!result.ok) {
      if (result.reason === 'wrong_passphrase') {
        setError('Wrong current passphrase.');
      } else {
        setError('Could not update passphrase.');
      }
      return;
    }
    setDone(
      settingNew
        ? 'Passphrase updated. Future loads will require it.'
        : 'Passphrase removed. Identity is no longer sealed at rest.',
    );
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="passphrase-settings-screen"
      testID="passphrase-settings-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Passphrase
      </Text>
      <Text
        className="text-sm text-text-secondary mb-6"
        testID="passphrase-status">
        {sealed
          ? 'This device is currently protected by a passphrase.'
          : 'This device has no passphrase set. Set one to encrypt the identity bundle at rest.'}
      </Text>

      <Card variant="default" style={{marginBottom: 16}}>
        <Text className="font-display text-lg font-bold text-text mb-2">
          Unlock methods
        </Text>
        <Text className="text-sm text-text-secondary mb-4">
          Biometrics are tried first where the platform supports them. Keep a passphrase as the recovery fallback for this device.
        </Text>
        <View className="flex-row flex-wrap" style={{gap: 8}}>
          <Button
            testID="passphrase-settings-biometric-enroll-btn"
            accessibilityLabel="enable biometric unlock"
            variant="secondary"
            size="sm"
            label="Enable biometrics"
            disabled={!sealed}
            onPress={() =>
              setDone(
                sealed
                  ? 'Biometric unlock will be requested by the device keychain on the next unlock.'
                  : null,
              )
            }
          />
          <Button
            testID="passphrase-settings-passkey-enroll-btn"
            accessibilityLabel="enable passkey unlock"
            variant="secondary"
            size="sm"
            label="Enable passkey"
            disabled={!sealed}
            onPress={() =>
              setDone(
                sealed
                  ? 'Passkey unlock can be enrolled from this device after passphrase protection is active.'
                  : null,
              )
            }
          />
        </View>
      </Card>

      <Card variant="default" style={{marginBottom: 16}}>
        {sealed ? (
          <Field label="Current passphrase">
            <Input
              testID="passphrase-current-input"
              accessibilityLabel="current passphrase"
              value={current}
              onChangeText={setCurrent}
              autoCapitalize="none"
              autoCorrect={false}
              variant="password"
              placeholder="Your current passphrase"
            />
          </Field>
        ) : null}

        <Field
          label={sealed ? 'New passphrase (leave blank to remove)' : 'New passphrase'}>
          <Input
            testID="passphrase-new-input"
            accessibilityLabel="new passphrase"
            value={next}
            onChangeText={setNext}
            autoCapitalize="none"
            autoCorrect={false}
            variant="password"
            placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
          />
        </Field>

        {settingNew ? (
          <Field label="Confirm new passphrase">
            <Input
              testID="passphrase-confirm-input"
              accessibilityLabel="confirm new passphrase"
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              variant="password"
              placeholder="Repeat the new passphrase"
            />
          </Field>
        ) : null}

        {error ? (
          <Text testID="passphrase-error" className="text-xs mb-2 text-danger">
            {error}
          </Text>
        ) : null}
        {done ? (
          <Text testID="passphrase-done" className="text-xs mb-2 text-success">
            {done}
          </Text>
        ) : null}
      </Card>

      <View className="flex-row" style={{gap: 12}}>
        <Button
          testID="passphrase-settings-submit-btn"
          accessibilityLabel="save passphrase change"
          variant="primary"
          size="md"
          disabled={!canSubmit}
          label={pending ? 'Saving…' : settingNew ? 'Save' : 'Remove passphrase'}
          onPress={onSubmit}
        />
        <Button
          testID="passphrase-settings-back-btn"
          accessibilityLabel="back"
          variant="secondary"
          size="md"
          label="Back"
          onPress={onBack}
        />
      </View>
    </ScrollView>
  );
}
