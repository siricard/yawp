import React, {useState} from 'react';
import {Text, View} from 'react-native';

import {submitClaim} from '../claim';
import {submitBindDevice} from '../bind';
import {submitRedeemInvite} from '../invite';
import {submitRedeemRoomInvite} from '../room-invite';
import {useRecordFirstBoundAt} from '../nudge-store';
import {parseInviteLink} from '../onboarding/parseInviteLink';
import {parseRoomInviteLink} from '../onboarding/parseRoomInviteLink';
import {
  probeServerInfo,
  type ServerInfo,
} from '../onboarding/useServerInfoProbe';
import {
  useIdentityState,
  useWorkspaceServers,
  type WorkspaceServer,
} from '../identity-context';
import {Banner, Button, Field, Input} from '../ui';

type Props = {
  onCancel: () => void;
  onAdded: (server: WorkspaceServer) => void;
  /**
   * invoked after a successful invite-token redeem + bind to navigate the
   * newly-joined user straight into the server's `#general` channel. The
   * claim (operator) branch still uses `onAdded` (lands on home with the
   * new tile selected).
   */
  onNavigateToServer?: (server: WorkspaceServer) => void;
};

type Step = 'connect' | 'code';

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

  const [step, setStep] = useState<Step>('connect');
  const [pasteValue, setPasteValue] = useState('http://localhost:4000');
  const [serverUrl, setServerUrl] = useState('');
  const [tokenValue, setTokenValue] = useState('');
  const [probing, setProbing] = useState(false);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const identityReady = identityState.status === 'ready';

  async function probeAndAdvance(url: string, prefilledToken: string | null) {
    setProbing(true);
    setProbeError(null);
    setErrorMessage(null);

    const result = await probeServerInfo(url);

    setProbing(false);

    if (!result.ok) {
      setInfo(null);
      setProbeError(result.message);
    } else {
      setInfo(result.info);
    }

    if (prefilledToken) {
      setTokenValue(prefilledToken);
    }
    setStep('code');
  }

  async function handleConnect() {
    if (probing || submitting) return;
    const raw = pasteValue.trim();
    if (raw.length === 0) return;

    const roomInvite = parseRoomInviteLink(raw);
    if (roomInvite) {
      await handleJoinViaLink(roomInvite);
      return;
    }

    const parsed = parseInviteLink(raw);
    if (parsed) {
      setServerUrl(parsed.serverUrl);
      setProbing(true);
      setProbeError(null);
      setErrorMessage(null);

      const result = await probeServerInfo(parsed.serverUrl);
      setProbing(false);

      if (result.ok) {
        setInfo(result.info);
        const ok = await runBind(
          parsed.serverUrl,
          parsed.token,
          result.info.claimed,
        );
        if (!ok) {
          setTokenValue(parsed.token);
          setStep('code');
        }
        return;
      }

      setInfo(null);
      setProbeError(result.message);
      setTokenValue(parsed.token);
      setStep('code');
      return;
    }

    setServerUrl(raw);
    await probeAndAdvance(raw, null);
  }

  async function handleJoinViaLink(link: {
    serverUrl: string;
    channelId: string;
    token: string;
  }) {
    if (!identityReady) return;

    setSubmitting(true);
    setErrorMessage(null);

    const redeem = await submitRedeemRoomInvite({
      serverUrl: link.serverUrl,
      inviteToken: link.token,
      identity: identityState.identity,
    });

    if (!redeem.ok) {
      setSubmitting(false);
      setErrorMessage(redeem.message);
      return;
    }

    const bind = await submitBindDevice({
      serverUrl: link.serverUrl,
      identity: identityState.identity,
    });

    setSubmitting(false);

    if (!bind.ok) {
      setErrorMessage(bind.message);
      return;
    }

    await recordFirstBound();

    const server: WorkspaceServer = {
      url: link.serverUrl.replace(/\/+$/, ''),
      did: `did:yawp:${identityState.identity.did}`,
      role: redeem.kind === 'guest' ? 'Guest' : 'Member',
      label: labelFromUrl(link.serverUrl),
    };
    addServer(server);
    if (onNavigateToServer) {
      onNavigateToServer(server);
    } else {
      onAdded(server);
    }
  }

  async function runBind(
    rawUrl: string,
    rawToken: string,
    claimed: boolean,
  ): Promise<boolean> {
    if (!identityReady) return false;
    const url = rawUrl.trim();
    const token = rawToken.trim();
    if (url.length === 0 || token.length === 0) return false;

    setSubmitting(true);
    setErrorMessage(null);

    if (claimed) {
      const redeem = await submitRedeemInvite({
        serverUrl: url,
        inviteToken: token,
        identity: identityState.identity,
      });

      if (!redeem.ok) {
        setSubmitting(false);
        setErrorMessage(redeem.message);
        return false;
      }

      const bind = await submitBindDevice({
        serverUrl: url,
        identity: identityState.identity,
      });

      setSubmitting(false);

      if (!bind.ok) {
        setErrorMessage(bind.message);
        return false;
      }

      await recordFirstBound();

      const server: WorkspaceServer = {
        url: url.replace(/\/+$/, ''),
        did: `did:yawp:${identityState.identity.did}`,
        role: redeem.role,
        label: labelFromUrl(url),
      };
      addServer(server);
      if (onNavigateToServer) {
        onNavigateToServer(server);
      } else {
        onAdded(server);
      }
      return true;
    }

    const result = await submitClaim({
      serverUrl: url,
      claimToken: token,
      identity: identityState.identity,
    });

    if (result.ok) {
      const bind = await submitBindDevice({
        serverUrl: url,
        identity: identityState.identity,
      });

      setSubmitting(false);

      if (!bind.ok) {
        setErrorMessage(bind.message);
        return false;
      }

      await recordFirstBound();

      const server: WorkspaceServer = {
        url: url.replace(/\/+$/, ''),
        did: result.did,
        role: result.role,
        label: labelFromUrl(url),
      };
      addServer(server);
      onAdded(server);
      return true;
    }

    setSubmitting(false);
    setErrorMessage(result.message);
    return false;
  }

  async function handleSubmitCode() {
    if (!identityReady || submitting) return;
    await runBind(serverUrl, tokenValue, info?.claimed === true);
  }

  const codeLabel = info?.claimed ? 'Invite token' : 'Claim token';
  const codeHint = (() => {
    if (!info) {
      return 'Paste your token to continue.';
    }
    return info.claimed
      ? 'This server is set up. Paste your invite token.'
      : "This server hasn't been set up yet. Paste the operator claim token.";
  })();

  const canConnect = pasteValue.trim().length > 0 && !probing && !submitting;
  const canSubmitCode =
    identityReady &&
    !submitting &&
    serverUrl.trim().length > 0 &&
    tokenValue.trim().length > 0;

  return (
    <View
      className="flex-1 bg-bg px-6 pt-8 pb-4"
      nativeID="add-server-screen"
      testID="add-server-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Add server
      </Text>
      <Text className="text-sm text-text-secondary mb-4">
        Paste an invite or claim link to join instantly, or enter a server
        address and we&apos;ll guide you through the rest.
      </Text>

      {step === 'connect' ? (
        <>
          <Field
            label="Invite link or server address"
            helper="Paste an invite/claim link, a join-via-link room link, or just the server URL.">
            <Input
              testID="server-url-input"
              accessibilityLabel="invite link or server url"
              value={pasteValue}
              onChangeText={setPasteValue}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!probing}
              placeholder="https://server.example/invite#…, yawp://…/r/…?token=…, or http://localhost:4000"
            />
          </Field>

          <View className="flex-row" style={{gap: 12}}>
            <Button
              testID="add-server-next"
              accessibilityLabel="next"
              variant="primary"
              size="lg"
              disabled={!canConnect}
              label={probing ? 'Checking…' : 'Next'}
              onPress={handleConnect}
            />
            <Button
              testID="add-server-cancel"
              accessibilityLabel="cancel"
              variant="secondary"
              size="lg"
              disabled={probing}
              label="Cancel"
              onPress={onCancel}
            />
          </View>
        </>
      ) : (
        <>
          <View className="mb-3">
            <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
              Server
            </Text>
            <Text
              testID="add-server-resolved-url"
              className="text-sm font-mono text-text">
              {serverUrl.replace(/\/+$/, '')}
            </Text>
          </View>

          {probeError ? (
            <View className="mb-4">
              <Banner
                kind="warning"
                message={probeError}
                testID="add-server-probe-error"
              />
            </View>
          ) : null}

          <Field label={codeLabel} helper={codeHint}>
            <Input
              testID="claim-token-input"
              accessibilityLabel={info?.claimed ? 'invite token' : 'claim token'}
              value={tokenValue}
              onChangeText={setTokenValue}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              placeholder={
                info?.claimed
                  ? 'Paste the chat-owner invite token'
                  : 'Paste the operator-issued claim token'
              }
            />
          </Field>

          {errorMessage ? (
            <View className="mb-4">
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
              disabled={!canSubmitCode}
              label={submitting ? 'Adding…' : 'Add server'}
              onPress={handleSubmitCode}
            />
            <Button
              testID="add-server-back"
              accessibilityLabel="back"
              variant="secondary"
              size="lg"
              disabled={submitting}
              label="Back"
              onPress={() => {
                setStep('connect');
                setErrorMessage(null);
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}
