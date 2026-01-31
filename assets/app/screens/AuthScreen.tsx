
import React from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {useAuthenticatedSocket} from '../auth';

type Props = {
  onBack: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function AuthScreen({onBack}: Props) {
  const auth = useAuthenticatedSocket();

  let statusText: string;
  let statusColor: string;
  switch (auth.status) {
    case 'idle':
    case 'connecting':
      statusText = 'Connecting...';
      statusColor = 'text-slate-300';
      break;
    case 'authenticating':
      statusText = 'Authenticating...';
      statusColor = 'text-amber-300';
      break;
    case 'authenticated':
      statusText = `Authenticated as ${auth.did}`;
      statusColor = 'text-emerald-300';
      break;
    case 'error':
      statusText = `Auth failed: ${auth.reason}`;
      statusColor = 'text-rose-300';
      break;
  }

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="auth-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-6">
        Authentication
      </Text>

      <View
        className="bg-slate-800 rounded-lg p-4 mb-6"
        testID="auth-status-card"
        accessibilityLabel={`auth-status-${auth.status}`}>
        <Text className="text-sm font-semibold text-slate-400 mb-2">
          Status
        </Text>
        <Text
          className={`text-base ${statusColor} break-all`}
          style={{fontFamily: monospace}}
          testID="auth-status-text"
          selectable>
          {statusText}
        </Text>
      </View>

      <Text className="text-xs text-slate-500 mb-6 leading-5">
        Joins the `auth:lobby` channel, signs the server nonce, and pushes
        `authenticate` with `{'{did, pk, signature}'}`. See
        docs/adr/001-auth-wire-format.md.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 self-start active:bg-slate-600">
        <Text className="text-sm font-semibold text-slate-50">Back</Text>
      </Pressable>
    </View>
  );
}
