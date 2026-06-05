
import React, {useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {usePassphrase} from '../identity-context';
import {
  defaultUnlockAvailability,
  resolveUnlockChoice,
  type UnlockMethod,
} from '../identity/unlock-methods';
import {Button, Card, DidPill, Field, Input} from '../ui';

const METHOD_LABEL: Record<UnlockMethod, string> = {
  biometric: 'Use biometrics',
  device_passcode: 'Use device passcode',
  passkey: 'Use passkey',
  passphrase: 'Use passphrase',
};

export function LockedScreen() {
  const {unlock, lockedDidPrefix} = usePassphrase();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempts, setAttempts] = useState<
    Parameters<typeof resolveUnlockChoice>[1]
  >([{type: 'start'}]);
  const [activeFallback, setActiveFallback] = useState<UnlockMethod>('passphrase');
  const choice = resolveUnlockChoice(defaultUnlockAvailability(), attempts);
  const showPassphrase =
    activeFallback === 'passphrase' ||
    choice.primary === 'passphrase' ||
    choice.fallbacks.includes('passphrase');

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

  function onMethodPress(method: UnlockMethod) {
    if (method === 'passphrase') {
      setActiveFallback('passphrase');
      setError(null);
      return;
    }
    if (method === 'biometric') {
      setAttempts(prev => [...prev, {type: 'biometric_declined'}]);
      setError('Biometric unlock was not completed. Choose another method.');
      return;
    }
    setActiveFallback(method);
    setError(
      method === 'passkey'
        ? 'Passkey unlock is available after enrolling this device in Settings.'
        : 'Device passcode unlock is available from the native system prompt.',
    );
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
            Unlock with the strongest method available on this device, or choose a fallback.
          </Text>

          {lockedDidPrefix ? (
            <View testID="locked-identity-context" className="mb-6">
              <DidPill testID="locked-did-pill" did={lockedDidPrefix} />
            </View>
          ) : (
            <View
              testID="locked-identity-context"
              className="bg-surface-2 rounded-md py-3 px-3 mb-6">
              <Text
                testID="locked-identity-placeholder"
                className="text-sm text-text-secondary text-center">
                Unknown identity — enter passphrase to unlock.
              </Text>
            </View>
          )}

          {choice.primary && choice.primary !== 'passphrase' ? (
            <View style={{marginBottom: 12}}>
              <Button
                testID={`locked-${choice.primary}-btn`}
                accessibilityLabel={METHOD_LABEL[choice.primary].toLowerCase()}
                variant="primary"
                size="md"
                block
                label={METHOD_LABEL[choice.primary]}
                onPress={() => onMethodPress(choice.primary!)}
              />
            </View>
          ) : null}

          {choice.fallbacks.length > 0 ? (
            <View
              testID="locked-fallback-methods"
              className="flex-row flex-wrap mb-4"
              style={{gap: 8}}>
              {choice.fallbacks.map(method => (
                <Button
                  key={method}
                  testID={`locked-${method}-fallback-btn`}
                  accessibilityLabel={METHOD_LABEL[method].toLowerCase()}
                  variant={activeFallback === method ? 'secondary' : 'ghost'}
                  size="sm"
                  label={METHOD_LABEL[method]}
                  onPress={() => onMethodPress(method)}
                />
              ))}
            </View>
          ) : null}

          {showPassphrase ? (
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
          ) : null}

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
