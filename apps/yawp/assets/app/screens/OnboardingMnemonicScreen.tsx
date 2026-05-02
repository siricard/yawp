
import React, {useEffect, useMemo, useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const COUNTDOWN_SECONDS = 5;
export const VERIFY_WORD_COUNT = 3;

type Props = {
  mnemonic: string[];
  /** Called after the user successfully verifies 3 random words. */
  onVerified: () => void;
  /**
   * Picker for the verify-step word positions. Injected for tests so we
   * can pin the positions deterministically. Defaults to Math.random.
   */
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
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="onboarding-mnemonic-screen"
      testID="onboarding-mnemonic-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Your recovery phrase
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        Write these 12 words down in order, on paper, somewhere safe. They are
        the only way to recover your identity if this device is lost. We can
        never see them — they never leave this device.
      </Text>

      {step === 'display' ? (
        <>
          <View
            testID="mnemonic-grid"
            accessibilityLabel="mnemonic words"
            className="flex-row flex-wrap mb-6 -mx-1">
            {mnemonic.map((word, idx) => (
              <View
                key={idx}
                testID={`mnemonic-word-${idx}`}
                className="w-1/4 px-1 py-1">
                <View className="bg-slate-800 border border-slate-700 rounded-lg py-2 px-2">
                  <Text className="text-xs text-slate-500">{idx + 1}</Text>
                  <Text
                    className="text-base text-slate-50"
                    style={{fontFamily: monospace}}
                    selectable>
                    {word}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            testID="mnemonic-confirm-btn"
            accessibilityRole="button"
            accessibilityLabel="i have written these down"
            accessibilityState={{disabled: !confirmEnabled}}
            disabled={!confirmEnabled}
            onPress={handleConfirm}
            className={[
              'rounded-lg py-3 px-4 self-start',
              confirmEnabled
                ? 'bg-indigo-500 active:bg-indigo-400'
                : 'bg-slate-700 opacity-60',
            ].join(' ')}>
            <Text className="text-sm font-semibold text-slate-50">
              {confirmEnabled
                ? 'I have written these down'
                : `I have written these down (${remaining}s)`}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="text-base font-semibold text-slate-200 mb-2">
            Confirm your recovery phrase
          </Text>
          <Text className="text-sm text-slate-400 mb-4">
            Type the words at the positions below — exactly as they appear on
            your written copy.
          </Text>

          {positions.map((pos, i) => (
            <View key={pos} className="mb-3">
              <Text className="text-xs text-slate-400 mb-1">
                Word #{pos + 1}
              </Text>
              <TextInput
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
                placeholderTextColor="#64748b"
                className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
                style={{fontFamily: monospace}}
              />
            </View>
          ))}

          {verifyError ? (
            <View
              testID="verify-error"
              accessibilityLabel="verify error"
              className="bg-rose-950 border border-rose-700 rounded-lg p-3 my-2">
              <Text className="text-sm text-rose-100">{verifyError}</Text>
            </View>
          ) : null}

          <Pressable
            testID="verify-submit-btn"
            accessibilityRole="button"
            accessibilityLabel="verify words"
            accessibilityState={{disabled: !verifyReady}}
            disabled={!verifyReady}
            onPress={handleVerifySubmit}
            className={[
              'rounded-lg py-3 px-4 self-start mt-2',
              verifyReady
                ? 'bg-indigo-500 active:bg-indigo-400'
                : 'bg-slate-700 opacity-60',
            ].join(' ')}>
            <Text className="text-sm font-semibold text-slate-50">
              Verify
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
