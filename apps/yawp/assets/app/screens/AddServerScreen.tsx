
import React, {useState} from 'react';
import {Platform, Pressable, Text, TextInput, View} from 'react-native';

import {submitClaim} from '../claim';
import {submitBindDevice} from '../bind';
import {submitRedeemInvite} from '../invite';
import {useRecordFirstBoundAt} from '../nudge-store';
import {
  useIdentityState,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';

type TokenKind = 'claim' | 'invite';

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
  const {recordFirstBound} = useRecordFirstBoundAt();

  const [serverUrl, setServerUrl] = useState('http://localhost:4000');
  const [tokenKind, setTokenKind] = useState<TokenKind>('claim');
  const [tokenValue, setTokenValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const identityReady = identityState.status === 'ready';
  const canSubmit =
    identityReady &&
    !submitting &&
    serverUrl.trim().length > 0 &&
    tokenValue.trim().length > 0;

  async function handleSubmit() {
    if (!identityReady || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    if (tokenKind === 'invite') {
      const redeem = await submitRedeemInvite({
        serverUrl: serverUrl.trim(),
        inviteToken: tokenValue.trim(),
        identity: identityState.identity,
      });

      if (!redeem.ok) {
        setSubmitting(false);
        setErrorMessage(redeem.message);
        return;
      }

      const bind = await submitBindDevice({
        serverUrl: serverUrl.trim(),
        identity: identityState.identity,
      });

      setSubmitting(false);

      if (!bind.ok) {
        setErrorMessage(bind.message);
        return;
      }

      await recordFirstBound();

      const server: WorkspaceServer = {
        url: serverUrl.trim().replace(/\/+$/, ''),
        did: `did:yawp:${identityState.identity.did}`,
        role: redeem.role,
        label: labelFromUrl(serverUrl.trim()),
      };
      addServer(server);
      onAdded(server);
      return;
    }

    const result = await submitClaim({
      serverUrl: serverUrl.trim(),
      claimToken: tokenValue.trim(),
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

      await recordFirstBound();

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
        Paste a claim token (from the server operator) or an invite token
        (from the chat owner) and we&apos;ll bind this device&apos;s identity
        to that server.
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
          Token kind
        </Text>
        <View className="flex-row gap-2" testID="token-kind-toggle">
          <Pressable
            testID="token-kind-claim"
            accessibilityRole="button"
            accessibilityLabel="claim token kind"
            onPress={() => setTokenKind('claim')}
            disabled={submitting}
            className={[
              'rounded-lg py-2 px-3 border',
              tokenKind === 'claim'
                ? 'bg-indigo-500 border-indigo-400'
                : 'bg-slate-800 border-slate-700',
            ].join(' ')}>
            <Text className="text-xs font-semibold text-slate-50">
              Claim token (operator)
            </Text>
          </Pressable>
          <Pressable
            testID="token-kind-invite"
            accessibilityRole="button"
            accessibilityLabel="invite token kind"
            onPress={() => setTokenKind('invite')}
            disabled={submitting}
            className={[
              'rounded-lg py-2 px-3 border',
              tokenKind === 'invite'
                ? 'bg-indigo-500 border-indigo-400'
                : 'bg-slate-800 border-slate-700',
            ].join(' ')}>
            <Text className="text-xs font-semibold text-slate-50">
              Invite token
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="mb-4">
        <Text className="text-sm font-semibold text-slate-300 mb-1">
          {tokenKind === 'claim' ? 'Claim token' : 'Invite token'}
        </Text>
        <TextInput
          testID="claim-token-input"
          accessibilityLabel={
            tokenKind === 'claim' ? 'claim token' : 'invite token'
          }
          value={tokenValue}
          onChangeText={setTokenValue}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholder={
            tokenKind === 'claim'
              ? 'Paste the operator-issued token'
              : 'Paste the chat-owner invite token'
          }
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
