
import React, {useMemo, useRef, useState} from 'react';
import {ScrollView, Text, type TextInput, View} from 'react-native';

import {ENGLISH_WORDLIST} from '../identity/bip39-wordlist';
import type {RestoreResult} from '../identity-context';
import {Autocomplete, Banner, Button} from '../ui';

type Props = {
  onRestore: (words: string[]) => Promise<RestoreResult>;
  onCancel: () => void;
};

const MAX_SUGGESTIONS = 5;

function reasonToMessage(reason: RestoreResult & {ok: false}): string {
  switch (reason.reason) {
    case 'wrong_word_count':
      return 'A recovery phrase must be exactly 12 words. Fill in every box.';
    case 'unknown_word':
      return 'One or more words are not in the BIP-39 wordlist. Check your spelling.';
    case 'bad_checksum':
      return 'That phrase is invalid (checksum failed). Re-check the order and spelling of every word.';
  }
}

function suggestionsFor(prefix: string): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  const out: string[] = [];
  for (const w of ENGLISH_WORDLIST) {
    if (w.startsWith(p)) {
      out.push(w);
      if (out.length >= MAX_SUGGESTIONS) break;
    }
  }
  return out;
}

export function RestoreMnemonicScreen({onRestore, onCancel}: Props) {
  const [words, setWords] = useState<string[]>(() =>
    Array.from({length: 12}, () => ''),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const normalized = useMemo(
    () => words.map(w => w.trim().toLowerCase()),
    [words],
  );
  const allFilled = normalized.every(w => w.length > 0);

  function setWord(i: number, value: string) {
    setWords(prev => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
    if (error) setError(null);
  }

  function selectWord(i: number, value: string) {
    setWord(i, value);
    inputRefs.current[i + 1]?.focus();
  }

  async function handleRestore() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onRestore(normalized);
      if (!result.ok) {
        setError(reasonToMessage(result));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      keyboardShouldPersistTaps="handled"
      nativeID="restore-mnemonic-screen"
      testID="restore-mnemonic-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Restore from recovery phrase
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
        Type your 12 recovery words in order. They never leave this device.
      </Text>

      <View
        testID="restore-grid"
        accessibilityLabel="restore mnemonic inputs"
        className="flex-row flex-wrap -mx-1 mb-4">
        {words.map((word, idx) => {
          const suggestions = suggestionsFor(word);
          return (
            <View key={idx} className="w-1/2 px-1 py-1">
              <View className="flex-row items-center mb-1" style={{gap: 6}}>
                <Text className="text-xs text-text-tertiary font-mono w-6">
                  {idx + 1}
                </Text>
                <View style={{flex: 1}}>
                  <Autocomplete
                    ref={el => {
                      inputRefs.current[idx] = el;
                    }}
                    inputTestID={`restore-input-${idx}`}
                    overlayTestID={`restore-suggestions-${idx}`}
                    optionTestID={s => `restore-suggestion-${idx}-${s}`}
                    accessibilityLabel={`recovery word ${idx + 1}`}
                    value={word}
                    onChangeText={v => setWord(idx, v)}
                    onSelect={s => selectWord(idx, s)}
                    suggestions={suggestions}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    placeholder="word"
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {error ? (
        <View className="mb-4">
          <Banner
            kind="danger"
            testID="restore-error"
            message={error}
          />
        </View>
      ) : null}

      <View className="flex-row" style={{gap: 12}}>
        <Button
          testID="restore-submit-btn"
          accessibilityLabel="restore identity"
          accessibilityState={{disabled: !allFilled || submitting}}
          variant="primary"
          size="lg"
          disabled={!allFilled || submitting}
          label={submitting ? 'Restoring…' : 'Restore identity'}
          onPress={handleRestore}
        />
        <Button
          testID="restore-cancel-btn"
          accessibilityLabel="back to onboarding choice"
          variant="secondary"
          size="lg"
          label="Back"
          onPress={onCancel}
        />
      </View>
    </ScrollView>
  );
}
