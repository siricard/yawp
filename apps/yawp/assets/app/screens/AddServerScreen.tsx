
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';

import {submitClaim} from '../claim';
import {submitBindDevice} from '../bind';
import {submitRedeemInvite} from '../invite';
import {useRecordFirstBoundAt} from '../nudge-store';
import {
  useIdentityState,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';
import {Banner, Button, Field, Input} from '../ui';

type TokenKind = 'claim' | 'invite';

type Props = {
  onCancel: () => void;
  onAdded: (server: WorkspaceServer) => void;
  /**
   * invoked after a successful invite-token redeem +
   * bind to navigate the newly-joined user straight into the server's
   * `#general` channel. Threaded from App.tsx so the same primitive
   * powers manual tile clicks and post-redeem auto-nav. The claim
   * (operator) branch still uses `onAdded` (lands on home with the
   * new tile selected).
   */
  onNavigateToServer?: (server: WorkspaceServer) => void;
};

function labelFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.host || raw;
  } catch {
    return raw;
  }
}

export function AddServerScreen({onCancel, onAdded, onNavigateToServer}: Props) {
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
      if (onNavigateToServer) {
        onNavigateToServer(server);
      } else {
        onAdded(server);
      }
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
      className="flex-1 bg-bg px-xl pt-2xl pb-lg"
      nativeID="add-server-screen"
      testID="add-server-screen">
      <Text className="font-display text-3xl font-bold text-text mb-xs">
        Add server
      </Text>
      <Text className="text-sm text-text-secondary mb-lg">
        Paste a claim token (from the server operator) or an invite token
        (from the chat owner) and we&apos;ll bind this device&apos;s identity
        to that server.
      </Text>

      <Field label="Server URL">
        <Input
          testID="server-url-input"
          accessibilityLabel="server url"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          placeholder="http://localhost:4000"
        />
      </Field>

      <Field label="Token kind">
        <View
          className="flex-row bg-surface-2 rounded-pill p-xs self-start"
          testID="token-kind-toggle">
          <Pressable
            testID="token-kind-claim"
            accessibilityRole="button"
            accessibilityLabel="claim token kind"
            onPress={() => setTokenKind('claim')}
            disabled={submitting}
            className={[
              'rounded-pill py-sm px-md',
              tokenKind === 'claim' ? 'bg-primary' : 'bg-transparent',
            ].join(' ')}>
            <Text
              className={[
                'text-xs font-semibold',
                tokenKind === 'claim' ? 'text-on-primary' : 'text-text',
              ].join(' ')}>
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
              'rounded-pill py-sm px-md',
              tokenKind === 'invite' ? 'bg-primary' : 'bg-transparent',
            ].join(' ')}>
            <Text
              className={[
                'text-xs font-semibold',
                tokenKind === 'invite' ? 'text-on-primary' : 'text-text',
              ].join(' ')}>
              Invite token
            </Text>
          </Pressable>
        </View>
      </Field>

      <Field label={tokenKind === 'claim' ? 'Claim token' : 'Invite token'}>
        <Input
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
        />
      </Field>

      {errorMessage ? (
        <View className="mb-lg">
          <Banner
            kind="danger"
            message={errorMessage}
            testID="add-server-error"
          />
        </View>
      ) : null}

      <View className="flex-row" style={{gap: 12}}>
        <Button
          testID="add-server-submit"
          accessibilityLabel="add server"
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          label={submitting ? 'Adding…' : 'Add server'}
          onPress={handleSubmit}
        />
        <Button
          testID="add-server-cancel"
          accessibilityLabel="cancel"
          variant="secondary"
          size="lg"
          disabled={submitting}
          label="Cancel"
          onPress={onCancel}
        />
      </View>
    </View>
  );
}
