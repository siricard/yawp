
import React, {useEffect, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useChannel, type ChannelMessage} from '../chat/channel-store';
import {hasPermission} from '../chat/edit-mode';
import {MessageBody} from '../chat/MessageBody';
import {useDisplayName, useIdentityState} from '../identity-context';
import {banServerMember, kickServerMember} from '../server-moderation';
import {pointerCursor} from '../ui/cursor';
import {WORKSPACE_BAR_HEIGHT} from './WorkspaceBar';

type Props = {
  serverUrl: string;
  serverId: string;
  serverLabel: string;
  channelId: string;
  channelName: string;
  onBack: () => void;
  onEffectiveBits?: (bits: number) => void;
  onRemoved?: (reason: string) => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function displayAuthor(authorDid: string): string {
  const full = `did:yawp:${authorDid}`;
  return full.length <= 18 ? full : `${full.slice(0, 12)}…${full.slice(-4)}`;
}

export function authorLabel(message: {
  sender_did: string;
  sender_display_name?: string | null;
}): string {
  const name = message.sender_display_name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name;
  }
  return displayAuthor(message.sender_did);
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function MessageRow({
  message,
  selfDid,
  selfDisplayName,
  replyTo,
  showHeader,
  canManageMessages,
  isEditing,
  editDraft,
  onChangeEditDraft,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onReply,
  onDelete,
}: {
  message: ChannelMessage;
  selfDid: string | null;
  selfDisplayName: string | null;
  replyTo: ChannelMessage | null;
  showHeader: boolean;
  canManageMessages: boolean;
  isEditing: boolean;
  editDraft: string;
  onChangeEditDraft: (text: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const isSelf = selfDid !== null && message.sender_did === selfDid;
  const label =
    isSelf && selfDisplayName ? selfDisplayName : authorLabel(message);
  const deleted = message.body === null;
  const canEdit = isSelf && !deleted;
  const canDelete = (isSelf || canManageMessages) && !deleted;
  return (
    <View testID={`channel-message-${message.id}`} className="px-6 py-2 group">
      {replyTo ? (
        <View
          testID={`reply-quote-${message.id}`}
          className="flex-row items-center mb-1 pl-3 border-l-2 border-border-soft"
          style={{gap: 6}}>
          <Text
            className="text-xs text-text-secondary"
            style={{fontFamily: monospace}}
            numberOfLines={1}>
            ↳ {authorLabel(replyTo)}
          </Text>
          <Text className="text-xs text-text-tertiary" numberOfLines={1}>
            {replyTo.body === null ? '[deleted]' : replyTo.body}
          </Text>
        </View>
      ) : null}
      {showHeader ? (
        <View className="flex-row items-baseline" style={{gap: 8}}>
          <Text
            testID={`message-author-header-${message.id}`}
            className="text-sm font-bold text-text"
            style={{fontFamily: monospace}}>
            {label}
          </Text>
          <Text
            className="text-xs text-text-tertiary"
            style={{fontFamily: monospace}}>
            {formatTimestamp(message.server_inserted_at)}
          </Text>
        </View>
      ) : null}

      {isEditing ? (
        <View style={{marginTop: 4}}>
          <TextInput
            testID={`channel-message-edit-input-${message.id}`}
            value={editDraft}
            onChangeText={onChangeEditDraft}
            onSubmitEditing={onSubmitEdit}
            autoFocus
            className="px-3 py-2 rounded-md bg-surface-2 text-text border border-border-soft"
          />
          <View className="flex-row mt-1" style={{gap: 8}}>
            <Pressable
              testID={`channel-message-edit-save-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel="save edit"
              onPress={onSubmitEdit}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-primary">
              <Text className="text-xs font-semibold text-on-primary">Save</Text>
            </Pressable>
            <Pressable
              testID={`channel-message-edit-cancel-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel="cancel edit"
              onPress={onCancelEdit}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-surface-2">
              <Text className="text-xs font-semibold text-text-secondary">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <MessageBody
          body={message.body}
          deleted={deleted}
          edited={message.edited === true}
        />
      )}

      {!isEditing && !deleted ? (
        <View
          testID={`message-actions-${message.id}`}
          className={[
            'flex-row mt-1',
            Platform.OS === 'web' ? 'opacity-0 group-hover:opacity-100' : '',
          ].join(' ')}
          style={{gap: 10}}>
          <Pressable
            testID={`message-reply-${message.id}`}
            accessibilityRole="button"
            accessibilityLabel="reply"
            onPress={onReply}
            style={pointerCursor}>
            <Text className="text-xs text-text-tertiary">Reply</Text>
          </Pressable>
          {canEdit ? (
            <Pressable
              testID={`message-edit-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel="edit"
              onPress={onStartEdit}
              style={pointerCursor}>
              <Text className="text-xs text-text-tertiary">Edit</Text>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              testID={`message-delete-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel="delete"
              onPress={onDelete}
              style={pointerCursor}>
              <Text className="text-xs text-danger">Delete</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MemberSheet({
  serverUrl,
  serverId,
  members,
  selfDid,
  canKick,
  canBan,
  onClose,
}: {
  serverUrl: string;
  serverId: string;
  members: string[];
  selfDid: string | null;
  canKick: boolean;
  canBan: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'kick' | 'ban', did: string) {
    setPending(`${kind}:${did}`);
    setError(null);
    const fn = kind === 'kick' ? kickServerMember : banServerMember;
    const result = await fn({
      serverUrl,
      serverId,
      did: `did:yawp:${did}`,
    });
    setPending(null);
    if (result.ok) {
      setRemoved(prev => ({...prev, [did]: kind === 'kick' ? 'Kicked' : 'Banned'}));
    } else {
      setError(result.message);
    }
  }

  return (
    <View
      testID="member-sheet"
      className="absolute top-0 right-0 bottom-0 w-72 bg-surface border-l border-border-soft"
      style={{paddingTop: 12}}>
      <View className="px-4 py-3 border-b border-border-soft flex-row items-center justify-between">
        <Text className="text-sm font-bold text-text">Members</Text>
        <Pressable
          testID="member-sheet-close"
          accessibilityRole="button"
          accessibilityLabel="close members"
          onPress={onClose}
          style={pointerCursor}
          className="w-7 h-7 rounded-pill bg-surface-2 items-center justify-center">
          <Text className="text-text-secondary text-xs">×</Text>
        </Pressable>
      </View>

      {error ? (
        <View testID="member-sheet-error" className="px-4 py-2 bg-danger/10">
          <Text className="text-xs text-danger">{error}</Text>
        </View>
      ) : null}

      <ScrollView className="flex-1">
        {members.map(did => {
          const isSelf = did === selfDid;
          const removedLabel = removed[did];
          return (
            <View
              key={did}
              testID={`member-row-${did}`}
              className="px-4 py-2 flex-row items-center justify-between border-b border-border-soft">
              <Text
                className="text-xs text-text flex-1"
                style={{fontFamily: monospace}}
                numberOfLines={1}>
                {displayAuthor(did)}
              </Text>
              {removedLabel ? (
                <Text className="text-xs text-text-tertiary">{removedLabel}</Text>
              ) : !isSelf && (canKick || canBan) ? (
                <View className="flex-row" style={{gap: 6}}>
                  {canKick ? (
                    <Pressable
                      testID={`member-kick-${did}`}
                      accessibilityRole="button"
                      accessibilityLabel="kick member"
                      disabled={pending !== null}
                      onPress={() => act('kick', did)}
                      style={pointerCursor}
                      className="px-2 py-1 rounded-pill bg-surface-2">
                      <Text className="text-xs text-text-secondary">Kick</Text>
                    </Pressable>
                  ) : null}
                  {canBan ? (
                    <Pressable
                      testID={`member-ban-${did}`}
                      accessibilityRole="button"
                      accessibilityLabel="ban member"
                      disabled={pending !== null}
                      onPress={() => act('ban', did)}
                      style={pointerCursor}
                      className="px-2 py-1 rounded-pill bg-danger">
                      <Text className="text-xs text-white">Ban</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ChannelScreen({
  serverUrl,
  serverId,
  serverLabel,
  channelId,
  channelName,
  onBack,
  onEffectiveBits,
  onRemoved,
}: Props) {
  const {
    status,
    errorMessage,
    removedReason,
    messages,
    effectiveBits,
    send,
    edit,
    remove,
  } = useChannel(serverUrl, serverId, channelId);
  useEffect(() => {
    onEffectiveBits?.(effectiveBits);
  }, [effectiveBits, onEffectiveBits]);
  useEffect(() => {
    if (status === 'removed') {
      onRemoved?.(removedReason ?? 'removed');
    }
  }, [status, removedReason, onRemoved]);
  const canManageMessages = hasPermission(effectiveBits, 'manage_messages');
  const canKick = hasPermission(effectiveBits, 'kick_members');
  const canBan = hasPermission(effectiveBits, 'ban_members');
  const insets = useSafeAreaInsets();
  const identityState = useIdentityState();
  const {effectiveDisplayName} = useDisplayName();
  const selfDid =
    identityState.status === 'ready' ? identityState.identity.did : null;
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChannelMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ChannelMessage | null>(
    null,
  );
  const [showMembers, setShowMembers] = useState(false);
  const listRef = useRef<FlatList<{message: ChannelMessage; showHeader: boolean}> | null>(null);

  const members = Array.from(new Set(messages.map(m => m.sender_did)));

  const messagesById = useRef<Map<string, ChannelMessage>>(new Map());
  messagesById.current = new Map(messages.map(m => [m.id, m]));
  const groupedMessages = messages.map((message, index) => ({
    message,
    showHeader: shouldShowAuthorHeader(messages[index - 1], message),
  }));

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({animated: true});
    });
  }, [messages.length]);

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    send(trimmed, replyTo ? replyTo.id : null);
    setDraft('');
    setReplyTo(null);
  }

  function handleStartEdit(message: ChannelMessage) {
    setEditingId(message.id);
    setEditDraft(message.body ?? '');
  }

  function handleSubmitEdit() {
    if (!editingId) return;
    const trimmed = editDraft.trim();
    if (trimmed) edit(editingId, trimmed);
    setEditingId(null);
    setEditDraft('');
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    remove(pendingDelete.id);
    setPendingDelete(null);
  }

  const statusClass =
    status === 'joined'
      ? 'text-xs text-success'
      : status === 'error'
        ? 'text-xs text-danger'
        : 'text-xs text-text-tertiary';

  if (status === 'removed') {
    return (
      <View
        testID="channel-removed"
        className="flex-1 bg-bg items-center justify-center px-8">
        <Text className="text-lg font-bold text-text text-center mb-2">
          You were removed from this server
        </Text>
        <Text className="text-sm text-text-secondary text-center mb-6">
          {removedReason === 'banned'
            ? 'A moderator banned you. You can no longer access this server.'
            : 'A moderator removed you. Ask for a new invite to rejoin.'}
        </Text>
        <Pressable
          testID="channel-removed-back"
          accessibilityRole="button"
          accessibilityLabel="back to home"
          onPress={onBack}
          style={pointerCursor}
          className="px-5 py-2 rounded-pill bg-primary">
          <Text className="text-on-primary font-semibold">Back to home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      testID="channel-screen"
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? insets.top + WORKSPACE_BAR_HEIGHT : 0
      }>
      <View className="px-6 py-3 border-b border-border-soft flex-row items-center bg-surface">
        <Pressable
          testID="channel-back-button"
          accessibilityRole="button"
          accessibilityLabel="back"
          onPress={onBack}
          className="mr-3 w-8 h-8 rounded-pill bg-surface-2 active:bg-surface-3 items-center justify-center">
          <Text className="text-text-secondary text-sm">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-base font-bold text-text">
            <Text className="text-primary" style={{fontFamily: monospace}}>
              #
            </Text>
            {channelName}
          </Text>
          <Text
            className="text-xs text-text-tertiary mt-0.5"
            style={{fontFamily: monospace}}>
            {serverLabel}
          </Text>
        </View>
        <Text testID="channel-status" className={statusClass} style={{fontFamily: monospace}}>
          {status}
        </Text>
        <Pressable
          testID="channel-members-toggle"
          accessibilityRole="button"
          accessibilityLabel="toggle members"
          onPress={() => setShowMembers(v => !v)}
          style={pointerCursor}
          className="ml-3 px-3 py-1 rounded-pill bg-surface-2 active:bg-surface-3">
          <Text className="text-xs text-text-secondary">Members</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View
          testID="channel-error"
          className="px-6 py-2 bg-danger/20 border-b border-danger">
          <Text className="text-xs text-danger">{errorMessage}</Text>
        </View>
      ) : null}

      <FlatList<{message: ChannelMessage; showHeader: boolean}>
        testID="channel-message-list"
        ref={listRef}
        className="flex-1"
        data={groupedMessages}
        keyExtractor={item => item.message.id}
        contentContainerStyle={{paddingVertical: 12}}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== 'web'}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({animated: false})
        }
        renderItem={({item}) => {
          const message = item.message;
          return (
          <MessageRow
            message={message}
            selfDid={selfDid}
            selfDisplayName={effectiveDisplayName}
            showHeader={item.showHeader}
            replyTo={
              message.reply_to_message_id
                ? messagesById.current.get(message.reply_to_message_id) ?? null
                : null
            }
            canManageMessages={canManageMessages}
            isEditing={editingId === message.id}
            editDraft={editDraft}
            onChangeEditDraft={setEditDraft}
            onStartEdit={() => handleStartEdit(message)}
            onCancelEdit={() => setEditingId(null)}
            onSubmitEdit={handleSubmitEdit}
            onReply={() => setReplyTo(message)}
            onDelete={() => setPendingDelete(message)}
          />
          );
        }}
      />

      {pendingDelete ? (
        <View
          testID="delete-confirm"
          className="px-6 py-3 border-t border-danger bg-danger/10 flex-row items-center justify-between">
          <Text className="text-xs text-danger flex-1">
            Delete this message? This cannot be undone.
          </Text>
          <View className="flex-row" style={{gap: 8}}>
            <Pressable
              testID="delete-confirm-cancel"
              accessibilityRole="button"
              accessibilityLabel="cancel delete"
              onPress={() => setPendingDelete(null)}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-surface-2">
              <Text className="text-xs font-semibold text-text-secondary">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              testID="delete-confirm-delete"
              accessibilityRole="button"
              accessibilityLabel="confirm delete"
              onPress={handleConfirmDelete}
              style={pointerCursor}
              className="px-3 py-1 rounded-pill bg-danger">
              <Text className="text-xs font-semibold text-white">Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {replyTo ? (
        <View
          testID="reply-card"
          className="px-6 py-2 border-t border-border-soft bg-surface flex-row items-center justify-between">
          <View className="flex-1 pl-3 border-l-2 border-primary" style={{marginRight: 8}}>
            <Text className="text-xs text-text-secondary" style={{fontFamily: monospace}}>
              Replying to {authorLabel(replyTo)}
            </Text>
            <Text className="text-xs text-text-tertiary" numberOfLines={1}>
              {replyTo.body === null ? '[deleted]' : replyTo.body}
            </Text>
          </View>
          <Pressable
            testID="reply-card-cancel"
            accessibilityRole="button"
            accessibilityLabel="cancel reply"
            onPress={() => setReplyTo(null)}
            style={pointerCursor}
            className="w-6 h-6 rounded-full bg-surface-2 items-center justify-center">
            <Text className="text-text-secondary text-xs">×</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="px-4 py-3 border-t border-border-soft bg-bg flex-row items-center" style={{gap: 8}}>
        <TextInput
          testID="channel-message-input"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          editable={status === 'joined'}
          placeholder={
            status === 'joined' ? `Message #${channelName}` : 'Connecting…'
          }
          placeholderTextColor="#7a8290"
          className="flex-1 px-4 py-2 rounded-pill bg-surface-2 text-text border border-border-soft"
        />
        <Pressable
          testID="channel-message-send"
          accessibilityRole="button"
          accessibilityLabel="send message"
          onPress={handleSend}
          disabled={status !== 'joined' || draft.trim().length === 0}
          className={[
            'px-5 py-2 rounded-pill bg-primary active:bg-primary-hover',
            status !== 'joined' || draft.trim().length === 0
              ? 'opacity-50'
              : '',
          ].join(' ')}>
          <Text className="text-on-primary font-semibold">Send</Text>
        </Pressable>
      </View>

      {showMembers ? (
        <MemberSheet
          serverUrl={serverUrl}
          serverId={serverId}
          members={members}
          selfDid={selfDid}
          canKick={canKick}
          canBan={canBan}
          onClose={() => setShowMembers(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function shouldShowAuthorHeader(
  previous: ChannelMessage | undefined,
  current: ChannelMessage,
): boolean {
  if (!previous) return true;
  if (previous.sender_did !== current.sender_did) return true;
  const prevTime = new Date(previous.server_inserted_at).getTime();
  const currentTime = new Date(current.server_inserted_at).getTime();
  if (!Number.isFinite(prevTime) || !Number.isFinite(currentTime)) return true;
  const groupingWindowMs = 300000;
  return currentTime - prevTime > groupingWindowMs;
}
