
import React, {useState} from 'react';
import {Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';

import {usePassphrase} from '../identity-context';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

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
      className="flex-1 bg-slate-900"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="passphrase-settings-screen"
      testID="passphrase-settings-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        Passphrase
      </Text>
      <Text className="text-sm text-slate-400 mb-6" testID="passphrase-status">
        {sealed
          ? 'This device is currently protected by a passphrase.'
          : 'This device has no passphrase set. Set one to encrypt the identity bundle at rest.'}
      </Text>

      {sealed ? (
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-300 mb-1">
            Current passphrase
          </Text>
          <TextInput
            testID="passphrase-current-input"
            accessibilityLabel="current passphrase"
            value={current}
            onChangeText={setCurrent}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Your current passphrase"
            placeholderTextColor="#64748b"
            className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
            style={{fontFamily: monospace}}
          />
        </View>
      ) : null}

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          {sealed ? 'New passphrase (leave blank to remove)' : 'New passphrase'}
        </Text>
        <TextInput
          testID="passphrase-new-input"
          accessibilityLabel="new passphrase"
          value={next}
          onChangeText={setNext}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
        />
      </View>

      {settingNew ? (
        <View className="mb-2">
          <Text className="text-sm font-semibold text-slate-300 mb-1">
            Confirm new passphrase
          </Text>
          <TextInput
            testID="passphrase-confirm-input"
            accessibilityLabel="confirm new passphrase"
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Repeat the new passphrase"
            placeholderTextColor="#64748b"
            className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
            style={{fontFamily: monospace}}
          />
        </View>
      ) : null}

      {error ? (
        <Text testID="passphrase-error" className="text-xs mb-2 text-rose-300">
          {error}
        </Text>
      ) : null}
      {done ? (
        <Text testID="passphrase-done" className="text-xs mb-2 text-emerald-300">
          {done}
        </Text>
      ) : null}

      <View className="flex-row gap-3 mt-4">
        <Pressable
          testID="passphrase-settings-submit-btn"
          accessibilityRole="button"
          accessibilityLabel="save passphrase change"
          accessibilityState={{disabled: !canSubmit}}
          disabled={!canSubmit}
          onPress={onSubmit}
          className={[
            'rounded-lg py-2 px-4',
            canSubmit
              ? 'bg-indigo-500 active:bg-indigo-400'
              : 'bg-slate-700 opacity-60',
          ].join(' ')}>
          <Text className="text-sm font-semibold text-slate-50">
            {pending ? 'Saving…' : settingNew ? 'Save' : 'Remove passphrase'}
          </Text>
        </Pressable>

        <Pressable
          testID="passphrase-settings-back-btn"
          accessibilityRole="button"
          accessibilityLabel="back"
          onPress={onBack}
          className="rounded-lg py-2 px-4 bg-slate-700 border border-slate-600 active:bg-slate-600">
          <Text className="text-sm font-semibold text-slate-50">Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
