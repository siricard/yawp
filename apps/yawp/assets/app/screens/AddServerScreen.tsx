
import React, {useState} from 'react';
import {Platform, Pressable, Text, TextInput, View} from 'react-native';

import {submitClaim} from '../claim';
import {submitBindDevice} from '../bind';
import {
  useIdentityState,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';

type Props = {
  onCancel: () => void;
  onAdded: (server: WorkspaceServer) => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

function labelFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.host || raw;
  } catch {
    return raw;
  }
}

export function AddServerScreen({onCancel, onAdded}: Props) {
  const identityState = useIdentityState();
  const {addServer} = useWorkspaceServers();

  const [serverUrl, setServerUrl] = useState('http://localhost:4000');
  const [claimToken, setClaimToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const identityReady = identityState.status === 'ready';
  const canSubmit =
    identityReady &&
    !submitting &&
    serverUrl.trim().length > 0 &&
    claimToken.trim().length > 0;

  async function handleSubmit() {
    if (!identityReady || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    const result = await submitClaim({
      serverUrl: serverUrl.trim(),
      claimToken: claimToken.trim(),
      identity: identityState.identity,
    });

    if (result.ok) {
      const bind = await submitBindDevice({
        serverUrl: serverUrl.trim(),
        identity: identityState.identity,
      });

      setSubmitting(false);

      if (!bind.ok) {
        setErrorMessage(bind.message);
        return;
      }

      const server: WorkspaceServer = {
        url: serverUrl.trim().replace(/\/+$/, ''),
        did: result.did,
        role: result.role,
        label: labelFromUrl(serverUrl.trim()),
      };
      addServer(server);
      onAdded(server);
      return;
    }

    setSubmitting(false);
    setErrorMessage(result.message);
  }

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="add-server-screen"
      testID="add-server-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">Add server</Text>
      <Text className="text-sm text-slate-400 mb-6">
        Paste the claim token your operator gave you and we&apos;ll bind this
        device&apos;s identity to that server.
      </Text>

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          Server URL
        </Text>
        <TextInput
          testID="server-url-input"
          accessibilityLabel="server url"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholder="http://localhost:4000"
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
        />
      </View>

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          Claim token
        </Text>
        <TextInput
          testID="claim-token-input"
          accessibilityLabel="claim token"
          value={claimToken}
          onChangeText={setClaimToken}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholder="Paste the operator-issued token"
          placeholderTextColor="#64748b"
          className="bg-slate-800 text-slate-50 rounded-lg px-3 py-2 border border-slate-700"
          style={{fontFamily: monospace}}
        />
      </View>

      {errorMessage ? (
        <View
          className="bg-rose-950 border border-rose-700 rounded-lg p-3 mb-4"
          testID="add-server-error"
          accessibilityLabel="add server error">
          <Text className="text-sm text-rose-100">{errorMessage}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <Pressable
          testID="add-server-submit"
          accessibilityRole="button"
          accessibilityLabel="add server"
          accessibilityState={{disabled: !canSubmit}}
          disabled={!canSubmit}
          onPress={handleSubmit}
          className={[
            'rounded-lg py-2 px-4',
            canSubmit
              ? 'bg-indigo-500 active:bg-indigo-400'
              : 'bg-slate-700 opacity-60',
          ].join(' ')}>
          <Text className="text-sm font-semibold text-slate-50">
            {submitting ? 'Adding…' : 'Add server'}
          </Text>
        </Pressable>

        <Pressable
          testID="add-server-cancel"
          accessibilityRole="button"
          accessibilityLabel="cancel"
          onPress={onCancel}
          disabled={submitting}
          className="rounded-lg py-2 px-4 bg-slate-700 border border-slate-600 active:bg-slate-600">
          <Text className="text-sm font-semibold text-slate-50">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
