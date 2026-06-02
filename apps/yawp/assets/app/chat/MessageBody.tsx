import React from 'react';
import {Platform, Text} from 'react-native';

import {parseMessageTokens, type MentionKind} from './mentions';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const MENTION_CLASS: Record<MentionKind, string> = {
  everyone: 'text-on-primary bg-primary',
  here: 'text-on-primary bg-primary',
  role: 'text-primary bg-primary/20',
  user: 'text-primary bg-primary/20',
};

export function MessageBody({
  body,
  deleted = false,
  edited = false,
  testID,
}: {
  body: string | null;
  deleted?: boolean;
  edited?: boolean;
  testID?: string;
}) {
  if (deleted || body === null) {
    return (
      <Text
        testID={testID}
        className="text-sm mt-1 leading-5 text-text-tertiary italic">
        [deleted]
      </Text>
    );
  }

  const tokens = parseMessageTokens(body);

  return (
    <Text testID={testID} className="text-sm mt-1 leading-5 text-text">
      {tokens.map((token, i) => {
        if (token.kind === 'text') {
          return <Text key={i}>{token.value}</Text>;
        }
        if (token.kind === 'code') {
          return (
            <Text
              key={i}
              className="text-primary"
              style={{fontFamily: monospace}}>
              {token.value}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            testID={`mention-${token.mentionKind}`}
            className={`font-semibold rounded ${MENTION_CLASS[token.mentionKind]}`}
            style={{paddingHorizontal: 3}}>
            {token.label}
          </Text>
        );
      })}
      {edited ? (
        <Text testID={testID ? `${testID}-edited` : undefined} className="text-xs text-text-tertiary">
          {' '}
          (edited)
        </Text>
      ) : null}
    </Text>
  );
}
