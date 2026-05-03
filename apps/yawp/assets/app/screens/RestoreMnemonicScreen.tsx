
import React, {useMemo, useRef, useState} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {ENGLISH_WORDLIST} from '../identity/bip39-wordlist';
import type {RestoreResult} from '../identity-context';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

type Props = {
  /**
   * Called with the 12 trimmed/lowercased words. Resolves with a
   * RestoreResult; on `{ok: true}` the parent transitions to the home
   * screen via the IdentityProvider state change.
   */
  onRestore: (words: string[]) => Promise<RestoreResult>;
  /** Called when the user clicks Back / Cancel. */
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

export function RestoreMnemonicScreen({onRestore, onCancel}: Props) {
  const [words, setWords] = useState<string[]>(() =>
    Array.from({length: 12}, () => ''),
  );
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const normalized = useMemo(
    () => words.map(w => w.trim().toLowerCase()),
    [words],
  );
  const allFilled = normalized.every(w => w.length > 0);

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

  function setWord(i: number, value: string) {
    setWords(prev => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
    if (error) setError(null);
  }

  function applySuggestion(i: number, word: string) {
    setWord(i, word);
    const nextRef = inputRefs.current[i + 1];
    if (nextRef && typeof nextRef.focus === 'function') {
      nextRef.focus();
    } else {
      setActiveIdx(null);
    }
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
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      keyboardShouldPersistTaps="handled"
      nativeID="restore-mnemonic-screen"
      testID="restore-mnemonic-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Restore from recovery phrase
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        Type your 12 recovery words in order. They never leave this device.
      </Text>

      <View
        testID="restore-grid"
        accessibilityLabel="restore mnemonic inputs"
        className="flex-row flex-wrap -mx-1 mb-4">
        {words.map((word, idx) => {
          const suggestions =
            activeIdx === idx ? suggestionsFor(word) : [];
          return (
            <View key={idx} className="w-1/2 px-1 py-1">
              <View className="bg-slate-800 border border-slate-700 rounded-lg py-2 px-2">
                <Text className="text-xs text-slate-500">{idx + 1}</Text>
                <TextInput
                  ref={el => {
                    inputRefs.current[idx] = el;
                  }}
                  testID={`restore-input-${idx}`}
                  accessibilityLabel={`recovery word ${idx + 1}`}
                  value={word}
                  onChangeText={v => setWord(idx, v)}
                  onFocus={() => setActiveIdx(idx)}
                  onBlur={() => {
                    setTimeout(() => {
                      setActiveIdx(current => (current === idx ? null : current));
                    }, 100);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholder="word"
                  placeholderTextColor="#64748b"
                  className="text-base text-slate-50"
                  style={{fontFamily: monospace}}
                />
              </View>
              {suggestions.length > 0 ? (
                <View
                  testID={`restore-suggestions-${idx}`}
                  className="bg-slate-800 border border-slate-700 rounded-lg mt-1">
                  {suggestions.map(s => (
                    <Pressable
                      key={s}
                      testID={`restore-suggestion-${idx}-${s}`}
                      accessibilityRole="button"
                      accessibilityLabel={`suggest ${s} for word ${idx + 1}`}
                      onPress={() => applySuggestion(idx, s)}
                      className="py-1 px-2 active:bg-slate-700">
                      <Text
                        className="text-sm text-slate-100"
                        style={{fontFamily: monospace}}>
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {error ? (
        <View
          testID="restore-error"
          accessibilityLabel="restore error"
          className="bg-rose-950 border border-rose-700 rounded-lg p-3 mb-4">
          <Text className="text-sm text-rose-100">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3 mt-2">
        <Pressable
          testID="restore-submit-btn"
          accessibilityRole="button"
          accessibilityLabel="restore identity"
          accessibilityState={{disabled: !allFilled || submitting}}
          disabled={!allFilled || submitting}
          onPress={handleRestore}
          className={[
            'rounded-lg py-3 px-4',
            allFilled && !submitting
              ? 'bg-indigo-500 active:bg-indigo-400'
              : 'bg-slate-700 opacity-60',
          ].join(' ')}>
          <Text className="text-sm font-semibold text-slate-50">
            {submitting ? 'Restoring…' : 'Restore identity'}
          </Text>
        </Pressable>
        <Pressable
          testID="restore-cancel-btn"
          accessibilityRole="button"
          accessibilityLabel="back to onboarding choice"
          onPress={onCancel}
          className="rounded-lg py-3 px-4 border border-slate-700 active:bg-slate-800">
          <Text className="text-sm font-semibold text-slate-300">Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
