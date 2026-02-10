
import React, {useState} from 'react';
import {Platform, Pressable, Text, TextInput, View} from 'react-native';

import {useIdentityState} from '../identity-context';
import {useSocketState} from '../auth';

type Props = {
  onBack: () => void;
  onStartCall: (peerDid: string) => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function CallLauncherScreen({onBack, onStartCall}: Props) {
  const identity = useIdentityState();
  const {token, tokenLoaded} = useSocketState();
  const [peerDid, setPeerDid] = useState('');

  const ourDid =
    identity.status === 'ready' ? identity.identity.did : null;
  const authenticated = tokenLoaded && Boolean(token);

  function startWith(did: string) {
    const trimmed = did.trim();
    if (!trimmed) {
      return;
    }
    onStartCall(trimmed);
  }

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="call-launcher-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">Call</Text>
      <Text
        className="text-xs text-slate-400 mb-6 break-all"
        style={{fontFamily: monospace}}>
        {ourDid ? `As ${ourDid}` : 'No identity yet'}
      </Text>

      {!authenticated ? (
        <View
          className="bg-slate-800 rounded-lg p-4 mb-6"
          testID="call-unauth"
          nativeID="call-unauth">
          <Text className="text-base text-amber-300 mb-2">
            Please authenticate
          </Text>
          <Text className="text-xs text-slate-400 leading-5">
            Open the Authenticate screen first so the call channel can
            verify your DID.
          </Text>
        </View>
      ) : null}

      <View className="bg-slate-800 rounded-lg p-4 mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-2">
          Peer DID
        </Text>
        <TextInput
          className="border border-slate-600 rounded px-3 py-2 text-slate-50 mb-3"
          placeholder="Paste a peer DID"
          placeholderTextColor="#64748b"
          value={peerDid}
          onChangeText={setPeerDid}
          editable={authenticated}
          testID="peer-did-input"
          nativeID="peer-did-input"
          autoCapitalize="none"
          autoCorrect={false}
          style={{fontFamily: monospace}}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => startWith(peerDid)}
          disabled={!authenticated || !peerDid.trim()}
          testID="start-call-button"
          nativeID="start-call-button"
          className={`rounded py-2 px-4 self-start ${
            !authenticated || !peerDid.trim()
              ? 'bg-slate-700 opacity-50'
              : 'bg-emerald-600 active:bg-emerald-500'
          }`}>
          <Text className="text-sm font-semibold text-white">Call</Text>
        </Pressable>
      </View>

      {ourDid ? (
        <View className="bg-slate-800 rounded-lg p-4 mb-6">
          <Text className="text-sm font-semibold text-slate-300 mb-2">
            Incoming
          </Text>
          <Text className="text-xs text-slate-500 mb-3 leading-5">
            Join your own DID's call topic so other peers can ring you.
            Phase 0 auto-accepts incoming offers to keep the test
            deterministic.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => startWith(ourDid)}
            disabled={!authenticated}
            testID="listen-incoming-button"
            nativeID="listen-incoming-button"
            className={`rounded py-2 px-4 self-start ${
              !authenticated
                ? 'bg-slate-700 opacity-50'
                : 'bg-indigo-600 active:bg-indigo-500'
            }`}>
            <Text className="text-sm font-semibold text-white">
              Listen for incoming
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        testID="call-launcher-back-button"
        className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 self-start active:bg-slate-600">
        <Text className="text-sm font-semibold text-slate-50">Back</Text>
      </Pressable>
    </View>
  );
}
