import React from 'react';
import {Pressable, Text, View} from 'react-native';

export type DidPillProps = {
  did: string;
  prefixLen?: number;
  suffixLen?: number;
  onCopy?: (did: string) => void;
  testID?: string;
};

function truncate(did: string, prefixLen: number, suffixLen: number): string {
  if (did.length <= prefixLen + suffixLen + 1) return did;
  return `${did.slice(0, prefixLen)}…${did.slice(-suffixLen)}`;
}

export function DidPill({
  did,
  prefixLen = 12,
  suffixLen = 6,
  onCopy,
  testID = 'did-pill',
}: DidPillProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    setCopied(true);
    onCopy?.(did);
    setTimeout(() => setCopied(false), 600);
  }, [did, onCopy]);

  const prefix = did.startsWith('did:yawp:')
    ? 'did:yawp:'
    : did.startsWith('yp:')
      ? 'yp:'
      : '';
  const rest = prefix ? did.slice(prefix.length) : did;
  const truncated = truncate(rest, Math.max(prefixLen - prefix.length, 4), suffixLen);

  return (
    <View
      testID={testID}
      accessibilityLabel={`did ${did}`}
      className="flex-row items-center bg-bg rounded-sm px-3 py-2"
      style={{gap: 8}}>
      <Text className="text-xs text-text-tertiary font-mono">DID</Text>
      <Text className="text-xs text-text-secondary font-mono flex-1">
        <Text className="text-primary">{prefix}</Text>
        {truncated}
      </Text>
      <Pressable
        testID={`${testID}-copy`}
        accessibilityRole="button"
        accessibilityLabel="copy did"
        onPress={handleCopy}
        className="active:opacity-70">
        <Text
          testID={`${testID}-copy-label`}
          className={`text-xs font-semibold ${
            copied ? 'text-success' : 'text-text-secondary'
          }`}>
          {copied ? 'Copied' : 'Copy'}
        </Text>
      </Pressable>
    </View>
  );
}
