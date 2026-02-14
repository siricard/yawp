
import React, {useEffect, useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {useIdentityState} from '../identity-context';
import {runIdentityVectorCheck, type VectorResult} from '../identity-vector';

type Props = {
  onOpenVectorTest: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function DidScreen({onOpenVectorTest}: Props) {
  const state = useIdentityState();
  const [vector, setVector] = useState<VectorResult | null>(null);

  useEffect(() => {
    const result = runIdentityVectorCheck();
    setVector(result);
    if (result.pass) {
      // eslint-disable-next-line no-console
      console.log('[identity-vector] PASS', result.details);
    } else {
      // eslint-disable-next-line no-console
      console.error('[identity-vector] FAIL', result.details);
    }
  }, []);

  const didText =
    state.status === 'ready'
      ? `Your DID: ${state.identity.did}`
      : state.status === 'loading'
        ? 'Generating identity…'
        : 'Identity unavailable — see error below.';

  const pkHex =
    state.status === 'ready'
      ? Array.from(state.identity.publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      : '';

  const vectorStatus = vector === null ? 'pending' : vector.pass ? 'pass' : 'fail';
  const vectorText =
    vector === null
      ? 'Running…'
      : vector.pass
        ? 'PASS — derived pubkey + DID match priv/test_vectors/identity.json'
        : 'FAIL — see console for details';

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="identity-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-6">
        Yawp Identity
      </Text>

      <View
        className="bg-slate-800 rounded-lg p-4 mb-4"
        testID="did-display"
        accessibilityLabel="DID display">
        <Text className="text-sm font-semibold text-slate-400 mb-1">
          Your DID
        </Text>
        <Text
          className="text-base text-slate-50 break-all"
          style={{fontFamily: monospace}}
          testID="did-text"
          selectable>
          {didText}
        </Text>
      </View>

      {state.status === 'ready' ? (
        <View className="bg-slate-800 rounded-lg p-4 mb-4">
          <Text className="text-sm font-semibold text-slate-400 mb-1">
            Public key (hex)
          </Text>
          <Text
            className="text-xs text-slate-300 break-all"
            style={{fontFamily: monospace}}
            testID="pubkey-hex">
            {pkHex}
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View
          className="bg-rose-950 border border-rose-700 rounded-lg p-4 mb-4"
          testID="identity-error"
          accessibilityLabel="identity error">
          <Text className="text-sm font-semibold text-rose-300 mb-1">
            Identity error
          </Text>
          <Text
            className="text-sm text-rose-100 break-all"
            style={{fontFamily: monospace}}
            selectable>
            {state.error}
          </Text>
        </View>
      ) : null}

      <View
        className="bg-slate-800 rounded-lg p-4 mb-6"
        testID="vector-check"
        accessibilityLabel={`vector-status-${vectorStatus}`}>
        <Text className="text-sm font-semibold text-slate-400 mb-1">
          Cross-platform vector
        </Text>
        <Text
          className="text-sm text-slate-50"
          style={{fontFamily: monospace}}>
          {vectorText}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenVectorTest}
        className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 self-start active:bg-slate-600">
        <Text className="text-sm font-semibold text-slate-50">
          Vector Test
        </Text>
      </Pressable>
    </View>
  );
}
