
import React, {useEffect, useState} from 'react';
import {Platform, Text, View} from 'react-native';

import {copyText, shareText} from '../clipboard';
import {useDisplayName, useIdentityState} from '../identity-context';
import {runIdentityVectorCheck, type VectorResult} from '../identity-vector';
import {Banner, Button, Card, DidPill} from '../ui';

type Props = {
  onOpenVectorTest: () => void;
  onCopy?: (text: string) => void;
  onShare?: (text: string) => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function DidScreen({onOpenVectorTest, onCopy, onShare}: Props) {
  const state = useIdentityState();
  const {effectiveDisplayName} = useDisplayName();
  const [vector, setVector] = useState<VectorResult | null>(null);

  const identity = state.status === 'ready' ? state.identity : null;

  const handleCopy = (text: string) => {
    onCopy?.(text);
    copyText(text).catch(() => {});
  };

  const handleShare = (text: string) => {
    onShare?.(text);
    shareText(text).catch(() => {});
  };

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
      ? `Your DID: ${state.identity.didFull}`
      : state.status === 'loading'
        ? 'Generating identity…'
        : 'Identity unavailable — see error below.';

  const pkHex =
    state.status === 'ready'
      ? Array.from(state.identity.masterPk)
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
      className="flex-1 bg-bg px-6 pt-8 pb-6"
      nativeID="identity-screen">
      <Text className="font-display text-3xl font-bold text-text mb-6">
        Yawp Identity
      </Text>

      {effectiveDisplayName ? (
        <View className="mb-3">
          <Card
            testID="identity-display-name"
            accessibilityLabel="display name">
            <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
              Display name
            </Text>
            <Text className="text-lg text-text">{effectiveDisplayName}</Text>
          </Card>
        </View>
      ) : null}

      <View className="mb-3">
        <Card testID="did-display" accessibilityLabel="DID display">
          <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
            Your DID
          </Text>
          <Text
            className="text-base text-text break-all"
            style={{fontFamily: monospace}}
            testID="did-text"
            selectable>
            {didText}
          </Text>
          {identity ? (
            <View className="mt-3">
              <DidPill
                did={identity.didFull}
                testID="did-pill"
                onCopy={handleCopy}
              />
            </View>
          ) : null}
        </Card>
      </View>

      {identity ? (
        <View className="mb-3">
          <Card testID="fingerprint-display" accessibilityLabel="fingerprint">
            <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
              Fingerprint
            </Text>
            <Text
              className="text-base text-text"
              style={{fontFamily: monospace}}
              testID="fingerprint-text"
              selectable>
              {identity.fingerprint}
            </Text>
            <View className="flex-row mt-3" style={{gap: 8}}>
              <Button
                variant="secondary"
                size="sm"
                label="Copy fingerprint"
                accessibilityLabel="copy fingerprint"
                testID="copy-fingerprint-btn"
                onPress={() => handleCopy(identity.fingerprint)}
              />
              <Button
                variant="secondary"
                size="sm"
                label="Share"
                accessibilityLabel="share fingerprint"
                testID="share-fingerprint-btn"
                onPress={() => handleShare(identity.fingerprint)}
              />
            </View>
          </Card>
        </View>
      ) : null}

      {state.status === 'ready' ? (
        <View className="mb-3">
          <Card>
            <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
              Public key (hex)
            </Text>
            <Text
              className="text-xs text-text-secondary break-all"
              style={{fontFamily: monospace}}
              testID="pubkey-hex">
              {pkHex}
            </Text>
          </Card>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View className="mb-3">
          <Banner
            kind="danger"
            title="Identity error"
            testID="identity-error"
            message={state.error}
          />
        </View>
      ) : null}

      <View className="mb-6">
        <Card
          testID="vector-check"
          accessibilityLabel={`vector-status-${vectorStatus}`}>
          <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
            Cross-platform vector
          </Text>
          <Text
            className="text-sm text-text"
            style={{fontFamily: monospace}}>
            {vectorText}
          </Text>
        </Card>
      </View>

      <View className="self-start">
        <Button
          variant="secondary"
          size="md"
          label="Vector Test"
          accessibilityLabel="Vector Test"
          onPress={onOpenVectorTest}
        />
      </View>
    </View>
  );
}
