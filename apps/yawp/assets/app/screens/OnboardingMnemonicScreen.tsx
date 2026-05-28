
import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {Button, Card, Field, Input} from '../ui';

export const COUNTDOWN_SECONDS = 5;
export const VERIFY_WORD_COUNT = 3;

type Props = {
  mnemonic: string[];
  onVerified: () => void;
  pickPositions?: (totalWords: number, take: number) => number[];
};

function defaultPickPositions(totalWords: number, take: number): number[] {
  const all = Array.from({length: totalWords}, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, take).sort((a, b) => a - b);
}

export function OnboardingMnemonicScreen({
  mnemonic,
  onVerified,
  pickPositions = defaultPickPositions,
}: Props) {
  const [step, setStep] = useState<'display' | 'verify'>('display');
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [attempts, setAttempts] = useState(0);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [positions, setPositions] = useState<number[]>(() =>
    pickPositions(mnemonic.length, VERIFY_WORD_COUNT),
  );
  const [inputs, setInputs] = useState<string[]>(() =>
    Array.from({length: VERIFY_WORD_COUNT}, () => ''),
  );

  useEffect(() => {
    if (step !== 'display') return;
    const interval = setInterval(() => {
      setRemaining(r => (r <= 0 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const confirmEnabled = step === 'display' && remaining === 0;

  function handleConfirm() {
    if (!confirmEnabled) return;
    setStep('verify');
  }

  function handleVerifySubmit() {
    const expected = positions.map(p => mnemonic[p].trim().toLowerCase());
    const actual = inputs.map(w => w.trim().toLowerCase());
    const correct = expected.every((w, i) => w === actual[i]);
    if (correct) {
      onVerified();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setInputs(Array.from({length: VERIFY_WORD_COUNT}, () => ''));
    setPositions(pickPositions(mnemonic.length, VERIFY_WORD_COUNT));
    setVerifyError(
      next === 1
        ? 'Those words don\u2019t match. Take another look at your written copy and try again.'
        : 'Still not matching. Your 12 words are still the same — check carefully before re-entering.',
    );
  }

  const verifyReady = inputs.every(s => s.trim().length > 0);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-mnemonic-screen"
      testID="onboarding-mnemonic-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Your recovery phrase
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
        Write these 12 words down in order, on paper, somewhere safe. They are
        the only way to recover your identity if this device is lost. We can
        never see them — they never leave this device.
      </Text>

      {step === 'display' ? (
        <>
          <Card variant="default" style={{marginBottom: 24}}>
            <View
              testID="mnemonic-grid"
              accessibilityLabel="mnemonic words"
              className="flex-row flex-wrap -mx-1">
              {mnemonic.map((word, idx) => (
                <View
                  key={idx}
                  testID={`mnemonic-word-${idx}`}
                  className="w-1/4 px-1 py-1">
                  <View className="bg-surface-2 rounded-md py-2 px-2">
                    <Text className="text-xs text-text-tertiary font-mono">
                      {idx + 1}
                    </Text>
                    <Text className="text-base text-text font-mono" selectable>
                      {word}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          <Button
            testID="mnemonic-confirm-btn"
            accessibilityLabel="i have written these down"
            accessibilityState={{disabled: !confirmEnabled}}
            variant="primary"
            size="md"
            disabled={!confirmEnabled}
            label={
              confirmEnabled
                ? 'I have written these down'
                : `I have written these down (${remaining}s)`
            }
            onPress={handleConfirm}
          />
        </>
      ) : (
        <>
          <Text className="text-base font-semibold text-text mb-2">
            Confirm your recovery phrase
          </Text>
          <Text className="text-sm text-text-secondary mb-4">
            Type the words at the positions below — exactly as they appear on
            your written copy.
          </Text>

          {positions.map((pos, i) => (
            <Field key={pos} label={`Word #${pos + 1}`}>
              <Input
                testID={`verify-input-${i}`}
                accessibilityLabel={`verify word position ${pos + 1}`}
                value={inputs[i]}
                onChangeText={v =>
                  setInputs(prev => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  })
                }
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="word"
              />
            </Field>
          ))}

          {verifyError ? (
            <View
              testID="verify-error"
              accessibilityLabel="verify error"
              className="bg-danger/20 border border-danger rounded-md p-3 my-2">
              <Text className="text-sm text-danger">{verifyError}</Text>
            </View>
          ) : null}

          <View style={{marginTop: 8}}>
            <Button
              testID="verify-submit-btn"
              accessibilityLabel="verify words"
              accessibilityState={{disabled: !verifyReady}}
              variant="primary"
              size="md"
              disabled={!verifyReady}
              label="Verify"
              onPress={handleVerifySubmit}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
