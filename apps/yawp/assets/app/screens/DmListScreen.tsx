import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, ScrollView, Text, View} from 'react-native';

import {useAnchorStatus} from '../chat/anchor-connection';
import {
  appendDmItem,
  decideDmSend,
  flushQueued,
  aggregateDelivery,
  hasQueued,
  type DmOutboxItem,
  type PerRecipientDelivery,
} from '../chat/dm-outbox';
import {Banner, Button, Input} from '../ui';
import {pointerCursor} from '../ui/cursor';
import {useOptionalBundleMetadata} from '../identity-context';

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export type DmParticipant = {
  did: string;
  label: string;
};

type DmThreadMessage = DmOutboxItem & {
  senderDid?: string;
  recipientDids?: string[];
  deliveryStates?: PerRecipientDelivery[];
  replyToId?: string | null;
};

export type DmConversation = {
  conversationId?: string;
  participants: DmParticipant[];
  messages: DmThreadMessage[];
  lastActivityAt?: string;
  pinnedPosition?: number | null;
  isRequest?: boolean;
};

export function DmListScreen({
  onBack,
  availablePeers = [],
  conversation,
  conversations,
  onStartConversation,
  onAcceptRequest,
  onOpenConversation,
}: {
  onBack: () => void;
  availablePeers?: DmParticipant[];
  conversation?: DmConversation;
  conversations?: DmConversation[];
  onStartConversation?: (recipientDids: string[]) => void;
  onAcceptRequest?: (senderDid: string) => Promise<boolean>;
  onOpenConversation?: (conversation: DmConversation) => void;
}) {
  const {degraded} = useAnchorStatus();
  const {metadata, mutate} = useOptionalBundleMetadata();
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<DmThreadMessage[]>(conversation?.messages ?? []);
  const [accepted, setAccepted] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const seq = useRef(0);
  const wasDegraded = useRef(degraded);
  const participantLabels = new Map(
    (conversation?.participants ?? []).map(participant => [participant.did, participant.label]),
  );

  useEffect(() => {
    if (wasDegraded.current && !degraded) {
      setItems(prev => (hasQueued(prev) ? flushQueued(prev) : prev));
    }
    wasDegraded.current = degraded;
  }, [degraded]);

  function handleSend() {
    const decision = decideDmSend(draft, degraded);
    if (!decision.accepted && decision.reason === 'empty') return;
    if (!conversation && availablePeers.length > 0 && selectedPeers.length === 0) return;
    onStartConversation?.(selectedPeers);
    seq.current += 1;
    const item: DmThreadMessage = {
      id: `dm-${seq.current}`,
      body: draft.trim(),
      delivery: decision.accepted ? 'sent' : 'queued',
    };
    setItems(prev => appendDmItem(prev, item));
    setDraft('');
  }

  function togglePeer(did: string) {
    setSelectedPeers(prev =>
      prev.includes(did) ? prev.filter(existing => existing !== did) : [...prev, did],
    );
  }

  const isRequest = Boolean(conversation?.isRequest && !accepted);
  const needsRecipient = !conversation && availablePeers.length > 0;
  const requestSender = conversation?.participants[0];
  const visibleConversations = conversations ?? (conversation ? [conversation] : []);
  const pinnedIds = new Set(metadataPinnedPeers(metadata));

  async function acceptRequest() {
    if (!requestSender) return;
    if (onAcceptRequest) {
      const persisted = await onAcceptRequest(requestSender.did);
      if (!persisted) return;
    }
    await mutate(prev => {
      const acceptedPeers = Array.from(new Set([...(prev.acceptedPeers ?? []), requestSender.did]));
      return {...prev, acceptedPeers};
    });
    setAccepted(true);
  }

  async function togglePin(target: DmConversation) {
    const key = target.conversationId ?? target.participants.map(p => p.did).sort().join('|');
    await mutate(prev => {
      const existing = metadataPinnedPeers(prev);
      const pinned = existing.includes(key)
        ? existing.filter(id => id !== key)
        : [...existing, key];
      return {...prev, pinnedPeers: pinned} as typeof prev;
    });
  }

  if (!conversation && visibleConversations.length > 0) {
    const requestConversations = visibleConversations.filter(item => item.isRequest);
    const mainConversations = visibleConversations.filter(item => !item.isRequest);
    return (
      <View testID="dm-list-screen" className="flex-1 bg-bg">
        <DmHeader onBack={onBack} />
        <ScrollView className="flex-1 px-6 py-4">
          <DmSection
            title="Message Requests"
            conversations={sortRecent(requestConversations)}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="Pinned"
            conversations={sortPinned(mainConversations)}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="Recent"
            conversations={sortRecent(mainConversations)}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="All"
            conversations={sortAll(mainConversations)}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View testID="dm-list-screen" className="flex-1 bg-bg">
      <DmHeader onBack={onBack} />

      <View className="flex-1 px-6 py-4">
        {isRequest ? (
          <View
            testID="dm-message-request-card"
            className="mb-4 rounded-lg border border-warning bg-warning-soft px-4 py-3">
            <Text className="text-sm font-bold text-text">Message Requests</Text>
            <Text className="text-xs text-text-secondary mt-1">
              Accept this conversation to reply and move it to your inbox.
            </Text>
            <View className="mt-3 flex-row">
              <Button testID="dm-accept-request-button" label="Accept" onPress={acceptRequest} />
            </View>
          </View>
        ) : null}
        {conversation ? (
          <View testID="dm-participant-list" className="mb-4 flex-row flex-wrap" style={{gap: 6}}>
            {conversation.participants.map(participant => (
              <View
                key={participant.did}
                testID={`dm-participant-${participant.did}`}
                className="rounded-pill border border-border-soft bg-surface-2 px-2 py-1">
                <Text className="text-xs text-text">{participant.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {!conversation && availablePeers.length > 0 ? (
          <View testID="dm-peer-picker" className="mb-4 flex-row flex-wrap" style={{gap: 6}}>
            {availablePeers.map(peer => {
              const selected = selectedPeers.includes(peer.did);
              return (
                <Pressable
                  key={peer.did}
                  testID={`dm-peer-toggle-${peer.did}`}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  onPress={() => togglePeer(peer.did)}
                  style={pointerCursor}
                  className={`rounded-pill border px-3 py-1 ${
                    selected ? 'border-primary bg-primary-soft' : 'border-border-soft bg-surface-2'
                  }`}>
                  <Text className="text-xs text-text">{peer.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-text-secondary text-sm text-center">
              No direct messages yet.
            </Text>
            <Text className="text-text-tertiary text-xs text-center mt-1">
              Conversations you start will show up here.
            </Text>
          </View>
        ) : (
          <View testID="dm-message-list" style={{gap: 8}}>
            {items.map((item, index) => {
              const previous = items[index - 1];
              const showHeader =
                !previous ||
                previous.senderDid !== item.senderDid ||
                item.senderDid === undefined;
              const replyTo = item.replyToId
                ? items.find(existing => existing.id === item.replyToId) ?? null
                : null;
              return (
              <View
                key={item.id}
                testID={`dm-message-${item.id}`}
                className="bg-surface-2 rounded-md px-3 py-2">
                {replyTo ? (
                  <View
                    testID={`dm-reply-quote-${item.id}`}
                    className="mb-1 pl-3 border-l-2 border-border-soft">
                    <Text className="text-xs text-text-secondary" numberOfLines={1}>
                      ↳ {replyTo.senderDid ? participantLabels.get(replyTo.senderDid) ?? 'Unknown' : 'Unknown'}
                    </Text>
                  </View>
                ) : null}
                {item.senderDid && showHeader ? (
                  <Text
                    testID={`dm-message-sender-${item.id}`}
                    className="text-xs font-bold text-text-secondary mb-1">
                    {participantLabels.get(item.senderDid) ?? item.senderDid}
                  </Text>
                ) : null}
                <Text className="text-sm text-text">{item.body}</Text>
                {item.delivery === 'queued' ? (
                  <Text
                    testID={`dm-queued-indicator-${item.id}`}
                    className="text-xs text-warning mt-1">
                    Queued — will send when you reconnect
                  </Text>
                ) : (
                  <DeliveryIndicator item={item} />
                )}
              </View>
              );
            })}
          </View>
        )}
      </View>

      <View className="px-6 pb-4 pt-2 border-t border-border-soft bg-surface">
        {isRequest ? (
          <View testID="dm-request-read-only-notice" className="mb-2">
            <Banner
              kind="info"
              message="This request is read-only until you accept the conversation."
            />
          </View>
        ) : degraded ? (
          <View className="mb-2">
            <Banner
              testID="dm-degraded-notice"
              kind="warning"
              message="You're offline. New messages stay on this device and send when you reconnect."
            />
          </View>
        ) : null}
        {isRequest ? null : (
          <View className="flex-row items-end" style={{gap: 8}}>
            <View className="flex-1">
              <Input
                testID="dm-composer-input"
                variant="textarea"
                placeholder="Write a message"
                value={draft}
                onChangeText={setDraft}
              />
            </View>
            <Button
              testID="dm-send-button"
              label={degraded ? 'Queue' : 'Send'}
              onPress={handleSend}
              disabled={draft.trim().length === 0 || (needsRecipient && selectedPeers.length === 0)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function DmHeader({onBack}: {onBack: () => void}) {
  return (
    <View className="px-6 py-3 border-b border-border-soft flex-row items-center bg-surface">
      <Pressable
        testID="dm-back-button"
        accessibilityRole="button"
        accessibilityLabel="back"
        onPress={onBack}
        style={pointerCursor}
        className="mr-3 w-8 h-8 rounded-pill bg-surface-2 active:bg-surface-3 items-center justify-center">
        <Text className="text-text-secondary text-sm">‹</Text>
      </Pressable>
      <Text className="text-base font-bold text-text">
        <Text className="text-primary" style={{fontFamily: monospace}}>
          @
        </Text>{' '}
        Direct messages
      </Text>
    </View>
  );
}

function DmSection({
  title,
  conversations,
  pinnedIds,
  onTogglePin,
  onOpenConversation,
}: {
  title: string;
  conversations: DmConversation[];
  pinnedIds: Set<string>;
  onTogglePin: (conversation: DmConversation) => void;
  onOpenConversation?: (conversation: DmConversation) => void;
}) {
  return (
    <View testID={`dm-section-${title.toLowerCase()}`} className="mb-5">
      <Text className="text-xs uppercase text-text-tertiary mb-2" style={{fontFamily: monospace}}>
        {title}
      </Text>
      <View style={{gap: 8}}>
        {conversations.map(conversation => {
          const id = conversation.conversationId ?? conversation.participants.map(p => p.did).sort().join('|');
          const label = conversation.participants.map(p => p.label).join(', ');
          return (
            <Pressable
              key={id}
              testID={`dm-conversation-${id}`}
              accessibilityRole="button"
              onPress={() => onOpenConversation?.(conversation)}
              style={pointerCursor}
              className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm font-bold text-text">{label}</Text>
                <Text className="text-xs text-text-tertiary" style={{fontFamily: monospace}}>
                  {id}
                </Text>
              </View>
              <Pressable
                testID={`dm-pin-${id}`}
                accessibilityRole="button"
                accessibilityLabel={pinnedIds.has(id) ? 'unpin peer' : 'pin peer'}
                onPress={() => onTogglePin(conversation)}
                style={pointerCursor}
                className="px-3 py-1 rounded-pill bg-surface-2">
                <Text className="text-xs text-text-secondary">
                  {pinnedIds.has(id) ? 'Unpin' : 'Pin'}
                </Text>
              </Pressable>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function sortPinned(conversations: DmConversation[]): DmConversation[] {
  return conversations
    .filter(c => typeof c.pinnedPosition === 'number')
    .sort((a, b) => (a.pinnedPosition ?? 0) - (b.pinnedPosition ?? 0));
}

function sortRecent(conversations: DmConversation[]): DmConversation[] {
  return [...conversations].sort(
    (a, b) =>
      new Date(b.lastActivityAt ?? 0).getTime() -
      new Date(a.lastActivityAt ?? 0).getTime(),
  );
}

function sortAll(conversations: DmConversation[]): DmConversation[] {
  return [...conversations].sort((a, b) =>
    a.participants.map(p => p.label).join(', ').localeCompare(b.participants.map(p => p.label).join(', ')),
  );
}

function metadataPinnedPeers(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const peers = (meta as {pinnedPeers?: unknown}).pinnedPeers;
  return Array.isArray(peers) ? peers.filter((peer): peer is string => typeof peer === 'string') : [];
}


function DeliveryIndicator({item}: {item: DmThreadMessage}) {
  const recipients = item.recipientDids ?? [];
  const states = item.deliveryStates ?? [];
  const group = recipients.length > 1 ? aggregateDelivery(states, recipients) : null;
  const state = item.delivery;

  const marks = state === 'sent' ? '✓' : '✓✓';
  const color = state === 'read' ? 'text-primary' : 'text-text-tertiary';
  const label =
    group && recipients.length > 1
      ? group.label
      : state === 'read'
        ? 'Read'
        : state === 'delivered'
          ? 'Delivered'
          : 'Sent';

  return (
    <Text
      testID={`dm-delivery-indicator-${item.id}`}
      className={`text-xs mt-1 ${color}`}
      style={Platform.OS === 'web' ? ({transitionDuration: '180ms'} as object) : undefined}>
      {marks} {label}
    </Text>
  );
}
