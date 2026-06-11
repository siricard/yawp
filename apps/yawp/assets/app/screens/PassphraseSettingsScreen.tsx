
import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import {useBundleMetadata, useIdentity, usePassphrase, useWorkspaceServers} from '../identity-context';
import {setReadReceipts, upsertNotificationPreference} from '../ash_generated';
import {normalizeAnchorServerUrl} from '../chat/anchor-url';
import {fetchServerTree, TreeChannel} from '../chat/server-tree';
import type {DmConversation} from './DmListScreen';
import {getValidSessionToken} from '../session';
import {Button, Card, Field, Input} from '../ui';

const MIN_PASSPHRASE_LENGTH = 8;
const NOTIFICATION_LEVELS = ['all', 'mentions_only', 'muted'] as const;

type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

type Props = {
  onBack: () => void;
  conversations?: DmConversation[];
};

export function PassphraseSettingsScreen({onBack, conversations = []}: Props) {
  const {
    sealed,
    changePassphrase,
    canUsePasskey,
    passkeyAvailableHint,
    passkeyEnrolled,
    enrollPasskey,
  } = usePassphrase();
  const identity = useIdentity();
  const {servers} = useWorkspaceServers();
  const {metadata, mutate} = useBundleMetadata();
  const [channelsByServer, setChannelsByServer] = useState<Record<string, TreeChannel[]>>({});
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receiptsPending, setReceiptsPending] = useState(false);
  const [passkeyCapable, setPasskeyCapable] = useState(passkeyAvailableHint);
  const readReceiptsEnabled = metadata.readReceiptsEnabled !== false;
  const notificationPreferences = metadata.notificationPreferences ?? {};
  const serverListKey = servers.map(server => `${server.serverId ?? server.did}:${server.url}`).join('|');

  useEffect(() => {
    let mounted = true;
    void canUsePasskey().then(ok => {
      if (mounted) setPasskeyCapable(ok);
    });
    return () => {
      mounted = false;
    };
  }, [canUsePasskey]);

  useEffect(() => {
    let mounted = true;
    void Promise.all(
      servers.map(async server => {
        const serverId = server.serverId ?? server.did;
        const tree = await fetchServerTree(server.url, serverId);
        return [serverId, tree.channels] as const;
      }),
    ).then(entries => {
      if (mounted) setChannelsByServer(Object.fromEntries(entries));
    });
    return () => {
      mounted = false;
    };
  }, [serverListKey]);

  const removingSeal = sealed && next.length === 0 && confirm.length === 0;
  const settingNew = next.length > 0;

  const nextOk = !settingNew || next.length >= MIN_PASSPHRASE_LENGTH;
  const matches = !settingNew || next === confirm;
  const currentProvided = !sealed || current.length > 0;
  const canSubmit =
    !pending && nextOk && matches && currentProvided && (removingSeal || settingNew);

  async function onSubmit() {
    setError(null);
    setDone(null);
    setPending(true);
    const result = await changePassphrase({
      current: sealed ? current : null,
      next: settingNew ? next : null,
    });
    setPending(false);
    if (!result.ok) {
      if (result.reason === 'wrong_passphrase') {
        setError('Wrong current passphrase.');
      } else {
        setError('Could not update passphrase.');
      }
      return;
    }
    setDone(
      settingNew
        ? 'Passphrase updated. Future loads will require it.'
        : 'Passphrase removed. Identity is no longer sealed at rest.',
    );
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  async function onEnrollPasskey() {
    setError(null);
    setDone(null);
    setPending(true);
    const result = await enrollPasskey();
    setPending(false);
    if (!result.ok) {
      setError(
        result.reason === 'unavailable'
          ? 'Passkey enrollment is not available on this browser.'
          : 'Could not enroll a passkey.',
      );
      return;
    }
    setDone('Passkey enrolled. You can now unlock this device with your passkey or passphrase.');
  }

  async function onToggleReadReceipts() {
    const next = !readReceiptsEnabled;
    setError(null);
    setDone(null);
    setReceiptsPending(true);
    await mutate(prev => ({...prev, readReceiptsEnabled: next}));
    const session = await getValidSessionToken({
      serverUrl: primaryAnchorUrl(metadata.publishedProfile?.anchors),
    });
    if (!session.ok) {
      await mutate(prev => ({...prev, readReceiptsEnabled: readReceiptsEnabled}));
      setError('Could not update read receipts.');
      setReceiptsPending(false);
      return;
    }
    const result = await setReadReceipts({
      identity: {did: identity.didFull},
      input: {readReceiptsEnabled: next},
      fields: ['did', 'readReceiptsEnabled'],
      headers: {Authorization: `Bearer ${session.sessionToken}`},
    });
    if (!result.success) {
      await mutate(prev => ({...prev, readReceiptsEnabled: readReceiptsEnabled}));
      setError('Could not update read receipts.');
    } else {
      setDone(next ? 'Read receipts enabled.' : 'Read receipts disabled.');
    }
    setReceiptsPending(false);
  }

  async function setNotificationLevel(
    scope: 'servers' | 'channels' | 'conversations',
    key: string,
    level: NotificationLevel,
  ) {
    const previous = metadata.notificationPreferences;
    await mutate(prev => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [scope]: {
          ...(prev.notificationPreferences?.[scope] ?? {}),
          [key]: level,
        },
      },
    }));
    const session = await getValidSessionToken({
      serverUrl: primaryAnchorUrl(metadata.publishedProfile?.anchors),
    });
    if (!session.ok) {
      await mutate(prev => ({...prev, notificationPreferences: previous}));
      setError('Could not update notification settings.');
      return;
    }
    const result = await upsertNotificationPreference({
      input: {
        identityDid: identity.didFull,
        serverId: scope === 'servers' ? key : null,
        channelId: scope === 'channels' ? key : null,
        conversationId: scope === 'conversations' ? key : null,
        level,
      },
      fields: ['id', 'level'],
      headers: {Authorization: `Bearer ${session.sessionToken}`},
    });
    if (!result.success) {
      await mutate(prev => ({...prev, notificationPreferences: previous}));
      setError('Could not update notification settings.');
    } else {
      setDone('Notification settings updated.');
    }
  }

  function nextNotificationLevel(level: NotificationLevel): NotificationLevel {
    const index = NOTIFICATION_LEVELS.indexOf(level);
    return NOTIFICATION_LEVELS[(index + 1) % NOTIFICATION_LEVELS.length];
  }

  function levelLabel(level: NotificationLevel) {
    if (level === 'mentions_only') return 'mentions only';
    return level;
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{padding: 24, paddingTop: 48}}
      nativeID="passphrase-settings-screen"
      testID="passphrase-settings-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Passphrase
      </Text>
      <Text
        className="text-sm text-text-secondary mb-6"
        testID="passphrase-status">
        {sealed
          ? 'This device is currently protected by a passphrase.'
          : 'This device has no passphrase set. Set one to encrypt the identity bundle at rest.'}
      </Text>

      <Card variant="default" style={{marginBottom: 16}}>
        <Text className="font-display text-lg font-bold text-text mb-2">
          Unlock methods
        </Text>
        <Text className="text-sm text-text-secondary mb-4">
          Biometrics are tried first where the platform supports them. Keep a passphrase as the recovery fallback for this device.
        </Text>
        <View className="flex-row flex-wrap" style={{gap: 8}}>
          <Button
            testID="passphrase-settings-biometric-enroll-btn"
            accessibilityLabel="enable biometric unlock"
            variant="secondary"
            size="sm"
            label="Enable biometrics"
            disabled={!sealed}
            onPress={() =>
              setDone(
                sealed
                  ? 'Biometric unlock will be requested by the device keychain on the next unlock.'
                  : null,
              )
            }
          />
          <Button
            testID="passphrase-settings-passkey-enroll-btn"
            accessibilityLabel="enable passkey unlock"
            variant="secondary"
            size="sm"
            label={passkeyEnrolled ? 'Passkey enabled' : 'Enable passkey'}
            disabled={!sealed || !passkeyCapable || passkeyEnrolled || pending}
            onPress={onEnrollPasskey}
          />
        </View>
      </Card>

      <Card variant="default" style={{marginBottom: 16}}>
        <Text className="font-display text-lg font-bold text-text mb-2">
          Direct messages
        </Text>
        <Text className="text-sm text-text-secondary mb-4">
          Send read receipts lets people see when you have read their direct messages.
        </Text>
        <Button
          testID="settings-read-receipts-toggle"
          accessibilityLabel="toggle send read receipts"
          variant={readReceiptsEnabled ? 'primary' : 'secondary'}
          size="sm"
          label={readReceiptsEnabled ? 'Send read receipts: on' : 'Send read receipts: off'}
          disabled={receiptsPending}
          onPress={onToggleReadReceipts}
        />
      </Card>

      <Card variant="default" style={{marginBottom: 16}}>
        <Text className="font-display text-lg font-bold text-text mb-2">
          Notifications
        </Text>
        <Text className="text-sm text-text-secondary mb-4">
          Choose which conversations can show banners. Badges still show when muted.
        </Text>
        <View className="flex-row flex-wrap" style={{gap: 8}}>
          {servers.map(server => {
            const serverId = server.serverId ?? server.did;
            const level = notificationPreferences.servers?.[serverId] ?? 'mentions_only';
            return (
              <Button
                key={serverId}
                testID={`settings-notifications-server-${serverId}`}
                accessibilityLabel={`set ${server.label} notifications`}
                variant="secondary"
                size="sm"
                label={`${server.label}: ${levelLabel(level)}`}
                onPress={() =>
                  setNotificationLevel('servers', serverId, nextNotificationLevel(level))
                }
              />
            );
          })}
          {servers.flatMap(server =>
            (channelsByServer[server.serverId ?? server.did] ?? []).map(channel => {
              const level = notificationPreferences.channels?.[channel.id] ?? 'mentions_only';
              return (
                <Button
                  key={channel.id}
                  testID={`settings-notifications-channel-${channel.id}`}
                  accessibilityLabel={`set ${channel.name} channel notifications`}
                  variant="secondary"
                  size="sm"
                  label={`#${channel.name}: ${levelLabel(level)}`}
                  onPress={() =>
                    setNotificationLevel('channels', channel.id, nextNotificationLevel(level))
                  }
                />
              );
            }),
          )}
          {conversations.filter(conversation => Boolean(conversation.conversationId)).map(conversation => {
            const conversationId = conversation.conversationId as string;
            const level =
              notificationPreferences.conversations?.[conversationId] ?? 'all';
            const label =
              conversation.participants.map(participant => participant.label).join(', ') ||
              conversationId;
            return (
              <Button
                key={conversationId}
                testID={`settings-notifications-dm-${conversationId}`}
                accessibilityLabel={`set ${label} direct message notifications`}
                variant="secondary"
                size="sm"
                label={`${label}: ${levelLabel(level)}`}
                onPress={() =>
                  setNotificationLevel(
                    'conversations',
                    conversationId,
                    nextNotificationLevel(level),
                  )
                }
              />
            );
          })}
        </View>
      </Card>

      <Card variant="default" style={{marginBottom: 16}}>
        {sealed ? (
          <Field label="Current passphrase">
            <Input
              testID="passphrase-current-input"
              accessibilityLabel="current passphrase"
              value={current}
              onChangeText={setCurrent}
              autoCapitalize="none"
              autoCorrect={false}
              variant="password"
              placeholder="Your current passphrase"
            />
          </Field>
        ) : null}

        <Field
          label={sealed ? 'New passphrase (leave blank to remove)' : 'New passphrase'}>
          <Input
            testID="passphrase-new-input"
            accessibilityLabel="new passphrase"
            value={next}
            onChangeText={setNext}
            autoCapitalize="none"
            autoCorrect={false}
            variant="password"
            placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
          />
        </Field>

        {settingNew ? (
          <Field label="Confirm new passphrase">
            <Input
              testID="passphrase-confirm-input"
              accessibilityLabel="confirm new passphrase"
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              variant="password"
              placeholder="Repeat the new passphrase"
            />
          </Field>
        ) : null}

        {error ? (
          <Text testID="passphrase-error" className="text-xs mb-2 text-danger">
            {error}
          </Text>
        ) : null}
        {done ? (
          <Text testID="passphrase-done" className="text-xs mb-2 text-success">
            {done}
          </Text>
        ) : null}
      </Card>

      <View className="flex-row" style={{gap: 12}}>
        <Button
          testID="passphrase-settings-submit-btn"
          accessibilityLabel="save passphrase change"
          variant="primary"
          size="md"
          disabled={!canSubmit}
          label={pending ? 'Saving…' : settingNew ? 'Save' : 'Remove passphrase'}
          onPress={onSubmit}
        />
        <Button
          testID="passphrase-settings-back-btn"
          accessibilityLabel="back"
          variant="secondary"
          size="md"
          label="Back"
          onPress={onBack}
        />
      </View>
    </ScrollView>
  );
}

function primaryAnchorUrl(anchors: string[] | undefined): string {
  return normalizeAnchorServerUrl(anchors?.[0] ?? '') ?? '';
}
