
import React, {useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {usePassphrase} from '../identity-context';
import {Button, Card, Field, Input} from '../ui';

export function LockedScreen() {
  const {unlock} = usePassphrase();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    if (!passphrase || pending) return;
    setPending(true);
    setError(null);
    const result = await unlock(passphrase);
    setPending(false);
    if (!result.ok) {
      if (result.reason === 'wrong_passphrase') {
        setError('Wrong passphrase. Try again.');
      } else if (result.reason === 'tampered') {
        setError('Stored identity appears tampered. Restore from your mnemonic.');
      } else {
        setError('Unlock failed.');
      }
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        padding: 24,
        paddingTop: 96,
        alignItems: 'center',
      }}
      nativeID="locked-screen"
      testID="locked-screen">
      <View style={{width: '100%', maxWidth: 420}}>
        <Card variant="elevated">
          <Text className="font-display text-2xl font-bold text-text mb-1">
            Unlock Yawp
          </Text>
          <Text className="text-sm text-text-secondary mb-6">
            This device is protected by a passphrase. Enter it to continue.
          </Text>

          <View
            testID="locked-identity-context"
            className="bg-surface-2 rounded-md py-3 px-3 mb-6">
            <Text className="text-sm text-text-secondary text-center">
              Enter your passphrase to unlock your identity on this device.
            </Text>
          </View>

          <Field
            label="Passphrase"
            error={error ?? undefined}
            testID="locked-passphrase-field">
            <Input
              testID="locked-passphrase-input"
              accessibilityLabel="passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              autoCapitalize="none"
              autoCorrect={false}
              variant="password"
              placeholder="Your passphrase"
              onSubmitEditing={onSubmit}
              error={!!error}
            />
          </Field>

          {error ? (
            <Text
              testID="locked-error"
              className="text-xs mb-2 text-danger">
              {error}
            </Text>
          ) : null}

          <View style={{marginTop: 8}}>
            <Button
              testID="locked-unlock-btn"
              accessibilityLabel="unlock"
              variant="primary"
              size="md"
              block
              disabled={!passphrase || pending}
              label={pending ? 'Unlocking…' : 'Unlock'}
              onPress={onSubmit}
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
