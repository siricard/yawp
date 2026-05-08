
import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

import {usePassphrase} from '../identity-context';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

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
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="locked-screen"
      testID="locked-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Unlock Yawp
      </Text>
      <Text className="text-sm text-slate-400 mb-6">
        This device is protected by a passphrase. Enter it to continue.
      </Text>

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          Passphrase
        </Text>
        <TextInput
          testID="locked-passphrase-input"
          accessibilityLabel="passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Your passphrase"
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
          onSubmitEditing={onSubmit}
        />
      </View>

      {error ? (
        <Text
          testID="locked-error"
          className="text-xs mb-4 text-rose-300">
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="locked-unlock-btn"
        accessibilityRole="button"
        accessibilityLabel="unlock"
        accessibilityState={{disabled: !passphrase || pending}}
        disabled={!passphrase || pending}
        onPress={onSubmit}
        className={[
          'rounded-lg py-2 px-4 self-start',
          !passphrase || pending
            ? 'bg-slate-700 opacity-60'
            : 'bg-indigo-500 active:bg-indigo-400',
        ].join(' ')}>
        <Text className="text-sm font-semibold text-slate-50">
          {pending ? 'Unlocking…' : 'Unlock'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
