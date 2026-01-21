import React, {useEffect, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
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
      console.log('[identity-vector] PASS', r.details);
    } else {
      console.error('[identity-vector] FAIL', r.details);
    }
  }, []);

  const status =
    result === null ? 'pending' : result.pass ? 'pass' : 'fail';
  const statusText =
    result === null ? 'Running…' : result.pass ? 'PASS' : 'FAIL';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Vector Test</Text>

      <Text
        style={[
          styles.status,
          status === 'pass' && styles.statusPass,
          status === 'fail' && styles.statusFail,
        ]}
        testID="vector-status">
        {statusText}
      </Text>

      {result !== null ? (
        <View style={styles.details}>
          <Text style={styles.label}>Expected pk (hex):</Text>
          <Text style={styles.mono}>{result.details.expectedPkHex}</Text>
          <Text style={styles.label}>Derived pk (hex):</Text>
          <Text style={styles.mono}>{result.details.derivedPkHex}</Text>
          <Text style={styles.label}>Expected DID:</Text>
          <Text style={styles.mono}>{result.details.expectedDid}</Text>
          <Text style={styles.label}>Derived DID:</Text>
          <Text style={styles.mono}>{result.details.derivedDid}</Text>
          <Text style={styles.label}>
            pk match: {String(result.details.pkMatch)}
          </Text>
          <Text style={styles.label}>
            DID match: {String(result.details.didMatch)}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
  },
  heading: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  status: {
    fontSize: 48,
    fontFamily: monospace,
    fontWeight: '700',
    marginBottom: 24,
    color: '#cbd5e1',
  },
  statusPass: {
    color: '#4ade80',
  },
  statusFail: {
    color: '#f87171',
  },
  details: {
    width: '100%',
    marginBottom: 24,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  mono: {
    color: '#e2e8f0',
    fontFamily: monospace,
    fontSize: 11,
  },
  button: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  buttonPressed: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
});
