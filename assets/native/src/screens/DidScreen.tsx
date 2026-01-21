import React, {useEffect, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {getOrCreateIdentity, type Identity} from '../identity';

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
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getOrCreateIdentity()
      .then(id => {
        if (mounted) {
          setIdentity(id);
        }
      })
      .catch(e => {
        if (mounted) {
          setError(String(e?.message ?? e));
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mook</Text>

      {error !== null ? (
        <Text style={styles.error}>Error: {error}</Text>
      ) : identity === null ? (
        <Text style={styles.subtitle}>Generating identity…</Text>
      ) : (
        <Text
          style={styles.did}
          testID="did-text"
          selectable
          accessibilityLabel="Your DID">
          Your DID: {identity.did}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onOpenVectorTest}
        style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Vector Test</Text>
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
  title: {
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 32,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  did: {
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: monospace,
    textAlign: 'center',
    marginBottom: 32,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    marginBottom: 32,
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
