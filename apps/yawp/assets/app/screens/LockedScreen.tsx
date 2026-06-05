
import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {usePassphrase} from '../identity-context';
import {
  detectUnlockAvailability,
  resolveUnlockChoice,
  type UnlockAvailability,
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
  const {
    unlock,
    unlockNative,
    unlockWithPasskey,
    canUsePasskey,
    passkeyAvailableHint,
    passkeyEnrolled,
    lockedDidPrefix,
  } = usePassphrase();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempts, setAttempts] = useState<
    Parameters<typeof resolveUnlockChoice>[1]
  >([{type: 'start'}]);
  const [activeFallback, setActiveFallback] = useState<UnlockMethod>('passphrase');
  const [passkeyCapable, setPasskeyCapable] = useState(passkeyAvailableHint);
  const [availability, setAvailability] = useState<UnlockAvailability | null>(
    null,
  );
  const resolvedAvailability =
    availability ?? {
      biometric: false,
      devicePasscode: false,
      passkey: false,
      passphrase: false,
    };
  useEffect(() => {
    let mounted = true;
    void canUsePasskey().then(ok => {
      if (mounted) setPasskeyCapable(ok);
    });
    void detectUnlockAvailability().then(next => {
      if (mounted) setAvailability(next);
    });
    return () => {
      mounted = false;
    };
  }, [canUsePasskey]);
  useEffect(() => {
    let mounted = true;
    if (!availability) return;
    if (availability.biometric) {
      setPending(true);
      setError(null);
      void unlockNative('biometric').then(result => {
        if (!mounted) return;
        setPending(false);
        if (!result.ok) {
          setAttempts(prev => [...prev, {type: 'biometric_declined'}]);
          setError('Biometric unlock was not completed. Choose another method.');
        }
      });
    } else {
      setAttempts(prev => [...prev, {type: 'biometric_unavailable'}]);
    }
    return () => {
      mounted = false;
    };
  }, [availability, unlockNative]);
  useEffect(() => {
    setAvailability(prev => {
      if (!prev) return prev;
      if (prev.passkey === passkeyCapable && prev.passphrase) return prev;
      return {...prev, passkey: passkeyCapable && passkeyEnrolled};
    });
  }, [passkeyCapable, passkeyEnrolled]);
  const choice = resolveUnlockChoice(resolvedAvailability, attempts);
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
    if (method === 'passkey') {
      setPending(true);
      setError(null);
      void unlockWithPasskey().then(result => {
        setPending(false);
        if (!result.ok) {
          setActiveFallback('passphrase');
          setError(
            result.reason === 'unavailable'
              ? 'Passkey unlock is not available on this browser. Use your passphrase.'
              : 'Passkey unlock was not completed. Use your passphrase.',
          );
        }
      });
      return;
    }
    if (method === 'biometric') {
      setPending(true);
      setError(null);
      void unlockNative('biometric').then(result => {
        setPending(false);
        if (!result.ok) {
          setAttempts(prev => [...prev, {type: 'biometric_declined'}]);
          setError('Biometric unlock was not completed. Choose another method.');
        }
      });
      return;
    }
    setPending(true);
    setError(null);
    void unlockNative('device_passcode').then(result => {
      setPending(false);
      if (!result.ok) {
        setActiveFallback('passphrase');
        setError('Device passcode unlock was not completed. Use your passphrase.');
      }
    });
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
