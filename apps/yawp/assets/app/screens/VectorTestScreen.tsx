
import React, {useEffect, useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {runIdentityVectorCheck, type VectorResult} from '../identity-vector';

type Props = {
  onBack: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function VectorTestScreen({onBack}: Props) {
  const [result, setResult] = useState<VectorResult | null>(null);

  useEffect(() => {
    const r = runIdentityVectorCheck();
    setResult(r);
    if (r.pass) {
      // eslint-disable-next-line no-console
      console.log('[identity-vector] PASS', r.details);
    } else {
      // eslint-disable-next-line no-console
      console.error('[identity-vector] FAIL', r.details);
    }
  }, []);

  const status = result === null ? 'pending' : result.pass ? 'pass' : 'fail';
  const statusText =
    result === null ? 'Running…' : result.pass ? 'PASS' : 'FAIL';
  const statusColor =
    status === 'pass'
      ? 'text-emerald-400'
      : status === 'fail'
        ? 'text-rose-400'
        : 'text-text-secondary';

  return (
    <View className="flex-1 bg-bg px-6 py-12 items-center justify-center">
      <Text className="text-2xl font-bold text-text mb-6">
        Vector Test
      </Text>

      <Text
        className={`text-5xl font-bold mb-6 ${statusColor}`}
        style={{fontFamily: monospace}}
        testID="vector-status">
        {statusText}
      </Text>

      {result !== null ? (
        <View className="w-full max-w-xl mb-6">
          <Text className="text-xs text-text-secondary mt-2">
            Expected pk (hex):
          </Text>
          <Text
            className="text-xs text-text break-all"
            style={{fontFamily: monospace}}>
            {result.details.expectedPkHex}
          </Text>
          <Text className="text-xs text-text-secondary mt-2">
            Derived pk (hex):
          </Text>
          <Text
            className="text-xs text-text break-all"
            style={{fontFamily: monospace}}>
            {result.details.derivedPkHex}
          </Text>
          <Text className="text-xs text-text-secondary mt-2">Expected DID:</Text>
          <Text
            className="text-xs text-text break-all"
            style={{fontFamily: monospace}}>
            {result.details.expectedDid}
          </Text>
          <Text className="text-xs text-text-secondary mt-2">Derived DID:</Text>
          <Text
            className="text-xs text-text break-all"
            style={{fontFamily: monospace}}>
            {result.details.derivedDid}
          </Text>
          <Text className="text-xs text-text-secondary mt-2">
            pk match: {String(result.details.pkMatch)}
          </Text>
          <Text className="text-xs text-text-secondary mt-2">
            DID match: {String(result.details.didMatch)}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="bg-surface-2 border border-border-soft rounded-lg py-2 px-4 active:bg-surface-3">
        <Text className="text-sm font-semibold text-text">Back</Text>
      </Pressable>
    </View>
  );
}
