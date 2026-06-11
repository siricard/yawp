import React, {useEffect, useRef, useState} from 'react';
import {Image, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import jsQR from 'jsqr';

import {useAnchorStatus} from '../chat/anchor-connection';
import {
  appendDmItem,
  applyDeliveryState,
  decideDmSend,
  flushQueued,
  aggregateDelivery,
  hasQueued,
  type DeliveryStateMap,
  type DmOutboxItem,
  type PerRecipientDelivery,
} from '../chat/dm-outbox';
import {Banner, Button, Input} from '../ui';
import {
  uploadAttachment,
  verifyAttachmentBytes,
  type AttachmentDescriptor,
} from '../chat/attachments';
import {pointerCursor} from '../ui/cursor';
import {fingerprintFromDid, fingerprintFromPubkey} from '../identity/did';
import {b64UrlToBytes} from '../identity/bundle';
import {useOptionalBundleMetadata} from '../identity-context';
import {
  peerVerificationRecord,
  peerVerificationRecords,
  upsertVerifiedPeer,
} from '../identity/verification';

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
  senderAnchors?: string[];
  recipientDids?: string[];
  deliveryStates?: PerRecipientDelivery[];
  replyToId?: string | null;
  createdAt?: string;
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
  deliveryStates,
  onStartConversation,
  onSendMessage,
  onAcceptRequest,
  onOpenConversation,
  serverUrl,
  uploadedByDid,
  attachmentFetchImpl,
}: {
  onBack: () => void;
  availablePeers?: DmParticipant[];
  conversation?: DmConversation;
  conversations?: DmConversation[];
  deliveryStates?: DeliveryStateMap;
  onStartConversation?: (
    recipientDids: string[],
    body: string,
    attachments?: AttachmentDescriptor[],
  ) => unknown;
  onSendMessage?: (
    recipientDids: string[],
    body: string,
    conversationId?: string,
    attachments?: AttachmentDescriptor[],
  ) => Promise<{
    id: string;
    conversationId: string;
    delivery: 'sent';
    senderDid: string;
    recipientDids: string[];
    createdAt: string;
  } | null>;
  onAcceptRequest?: (senderDid: string) => Promise<boolean>;
  onOpenConversation?: (conversation: DmConversation) => void;
  serverUrl?: string;
  uploadedByDid?: string;
  attachmentFetchImpl?: typeof fetch;
}) {
  const {degraded} = useAnchorStatus();
  const {metadata, mutate} = useOptionalBundleMetadata();
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<DmThreadMessage[]>(conversation?.messages ?? []);
  const [accepted, setAccepted] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [manualDid, setManualDid] = useState('');
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [profilePeer, setProfilePeer] = useState<DmParticipant | null>(null);
  const [verifyingPeer, setVerifyingPeer] = useState<DmParticipant | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Blob[]>([]);
  const [cameraState, setCameraState] = useState<
    'idle' | 'scanning' | 'matched' | 'mismatch' | 'unavailable'
  >('idle');
  const seq = useRef(0);
  const wasDegraded = useRef(degraded);
  const participantLabels = new Map(
    (conversation?.participants ?? []).map(participant => [participant.did, participant.label]),
  );

  useEffect(() => {
    setItems(conversation?.messages ?? []);
  }, [conversation?.conversationId, conversation?.messages]);

  useEffect(() => {
    let cancelled = false;
    const pending = items
      .flatMap(item =>
        (item.attachments ?? []).map((attachment, index) => ({item, attachment, index})),
      )
      .filter(({attachment}) => {
        const descriptor = attachment as AttachmentDescriptor;
        return Boolean(descriptor.download_url && descriptor.content_hash && descriptor.integrity_failed === undefined);
      });

    pending.forEach(({item, attachment, index}) => {
      const descriptor = attachment as AttachmentDescriptor;
      (async () => {
        try {
          const response = await (attachmentFetchImpl ?? fetch)(descriptor.download_url as string);
          const bytes = await response.arrayBuffer();
          const verified = response.ok && await verifyAttachmentBytes(bytes, descriptor.content_hash);
          if (cancelled) return;
          setItems(prev => updateAttachment(prev, item.id, index, {
            ...descriptor,
            integrity_failed: !verified,
          }));
        } catch {
          if (!cancelled) {
            setItems(prev => updateAttachment(prev, item.id, index, {
              ...descriptor,
              integrity_failed: true,
            }));
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [items, attachmentFetchImpl]);

  useEffect(() => {
    if (wasDegraded.current && !degraded) {
      setItems(prev => (hasQueued(prev) ? flushQueued(prev) : prev));
    }
    wasDegraded.current = degraded;
  }, [degraded]);

  async function uploadPendingAttachments(): Promise<AttachmentDescriptor[]> {
    if (pendingFiles.length === 0) return [];
    if (!serverUrl) throw new Error('missing attachment server');
    const uploaded = await Promise.all(
      pendingFiles.map(file =>
        uploadAttachment({
          serverUrl,
          file,
          uploadedByDid,
          fetchImpl: attachmentFetchImpl,
        }),
      ),
    );
    return uploaded.map(({ok: _ok, client_hash: _clientHash, ...descriptor}) => descriptor);
  }

  async function handleSend() {
    const decision = decideDmSend(draft, degraded);
    if (!decision.accepted && decision.reason === 'empty') return;
    if (!conversation && onStartConversation && selectedPeers.length === 0) return;
    const trimmed = draft.trim();
    const attachments = pendingFiles.length === 0 ? [] : await uploadPendingAttachments();
    const recipientDids = conversation
      ? conversation.participants
          .map(participant => participant.did)
          .filter(did => did !== items[0]?.senderDid)
      : selectedPeers;
    if (!conversation && onStartConversation) {
      if (attachments.length > 0) {
        onStartConversation(recipientDids, trimmed, attachments);
      } else {
        onStartConversation(recipientDids, trimmed);
      }
      setCreatingConversation(false);
      setDraft('');
      setPendingFiles([]);
      return;
    }
    seq.current += 1;
    const localId = `dm-${seq.current}`;
    const willSubmit = Boolean(onSendMessage);
    const item: DmThreadMessage = {
      id: localId,
      body: trimmed,
      attachments,
      delivery: willSubmit || decision.accepted ? 'sending' : 'queued',
      recipientDids,
    };
    setItems(prev => appendDmItem(prev, item));
    setDraft('');
    setPendingFiles([]);
    if (onSendMessage) {
      const sent = attachments.length > 0
        ? onSendMessage(recipientDids, trimmed, conversation?.conversationId, attachments)
        : onSendMessage(recipientDids, trimmed, conversation?.conversationId);
      sent.then(result => {
        if (!result) {
          setItems(prev =>
            prev.map(existing =>
              existing.id === localId ? {...existing, delivery: 'queued'} : existing,
            ),
          );
          return;
        }
        setItems(prev =>
          prev.map(existing =>
            existing.id === localId
              ? {
                  ...existing,
                  id: result.id,
                  delivery: result.delivery,
                  senderDid: result.senderDid,
                  recipientDids: result.recipientDids,
                  createdAt: result.createdAt,
                }
              : existing,
          ),
        );
      });
    }
  }

  function handleAttachFiles(files: FileList | null | undefined) {
    const selected = Array.from(files ?? []);
    if (selected.length > 0) {
      setPendingFiles(selected);
    }
  }

  function togglePeer(did: string) {
    setSelectedPeers(prev =>
      prev.includes(did) ? prev.filter(existing => existing !== did) : [...prev, did],
    );
  }

  function addManualDid() {
    const did = manualDid.trim();
    if (!did || did === 'did:yawp:' || selectedPeers.includes(did)) return;
    setSelectedPeers(prev => [...prev, did]);
    setManualDid('');
  }

  const isRequest = Boolean(conversation?.isRequest && !accepted);
  const needsRecipient = !conversation && Boolean(onStartConversation);
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

  async function confirmPeer(peer: DmParticipant, scannedFingerprint?: string) {
    const fingerprint = scannedFingerprint ?? fingerprintFromDid(peer.did);
    if (!fingerprint) return;
    await mutate(prev => ({
      ...prev,
      peerVerification: upsertVerifiedPeer(
        peerVerificationRecords(prev),
        peer.did,
        fingerprint,
        new Date().toISOString(),
      ),
    }));
    setVerifyingPeer(null);
    setProfilePeer(null);
  }

  async function startQrScan(peer: DmParticipant) {
    if (Platform.OS !== 'web') {
      setCameraState('unavailable');
      return;
    }
    const doc = globalThis.document;
    const devices = globalThis.navigator?.mediaDevices;
    if (!doc) {
      setCameraState('unavailable');
      return;
    }
    if (!devices?.getUserMedia) {
      setCameraState('unavailable');
      return;
    }
    try {
      setCameraState('scanning');
      const stream = await devices.getUserMedia({video: true});
      const video = doc.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      const canvas = doc.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext('2d');
      if (!context) {
        stream.getTracks().forEach(track => track.stop());
        setCameraState('unavailable');
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach(track => track.stop());
      const result = jsQR(image.data, image.width, image.height);
      const payload = parseIdentityQrPayload(result?.data);
      const fingerprint =
        payload?.did === peer.did ? fingerprintFromQrMasterPk(payload.master_pk) : null;
      if (!fingerprint) {
        setCameraState('mismatch');
        return;
      }
      await confirmPeer(peer, fingerprint);
      setCameraState('matched');
    } catch {
      setCameraState('unavailable');
    }
  }

  if (!conversation && visibleConversations.length > 0 && !creatingConversation) {
    const requestConversations = visibleConversations.filter(item => item.isRequest);
    const mainConversations = visibleConversations.filter(item => !item.isRequest);
    const pinnedConversations = sortPinned(mainConversations, pinnedIds);
    const unpinnedConversations = mainConversations.filter(
      item => !pinnedIds.has(conversationKey(item)),
    );
    return (
      <View testID="dm-list-screen" className="flex-1 bg-bg">
        <DmHeader onBack={onBack} />
        <ScrollView className="flex-1 px-6 py-4">
          {onStartConversation ? (
            <View className="mb-4">
              <Button
                testID="dm-new-group-button"
                label="New group DM"
                onPress={() => setCreatingConversation(true)}
              />
            </View>
          ) : null}
          <DmSection
            title="Message Requests"
            conversations={sortRecent(requestConversations)}
            pinnedIds={pinnedIds}
            verifiedPeerDids={verifiedPeerDids(metadata)}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="Pinned"
            conversations={pinnedConversations}
            pinnedIds={pinnedIds}
            verifiedPeerDids={verifiedPeerDids(metadata)}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="Recent"
            conversations={sortRecent(unpinnedConversations)}
            pinnedIds={pinnedIds}
            verifiedPeerDids={verifiedPeerDids(metadata)}
            onTogglePin={togglePin}
            onOpenConversation={onOpenConversation}
          />
          <DmSection
            title="All"
            conversations={sortAll(mainConversations)}
            pinnedIds={pinnedIds}
            verifiedPeerDids={verifiedPeerDids(metadata)}
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
            {conversation.participants.map(participant => {
              const verification = peerVerificationRecord(metadata, participant.did);
              return (
              <View
                key={participant.did}
                testID={`dm-participant-${participant.did}`}
                className="rounded-pill border border-border-soft bg-surface-2 px-2 py-1">
                <Pressable
                  testID={`dm-open-profile-${participant.did}`}
                  accessibilityRole="button"
                  onPress={() => setProfilePeer(participant)}
                  style={pointerCursor}
                  className="flex-row items-center">
                  <Text className="text-xs text-text">{participant.label}</Text>
                  {verification?.status === 'verified' ? (
                    <Text
                      testID={`dm-peer-verified-${participant.did}`}
                      accessibilityLabel="verified peer"
                      className="text-xs text-primary">
                      🛡✓
                    </Text>
                  ) : null}
                </Pressable>
              </View>
              );
            })}
          </View>
        ) : null}
        {conversation?.participants.some(
          participant =>
            peerVerificationRecord(metadata, participant.did)?.status === 'key_changed',
        ) ? (
          <View testID="dm-key-changed-banner" className="mb-4">
            <Banner
              kind="warning"
              message="This peer's identity key changed. Compare fingerprints before trusting new messages."
            />
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
        {!conversation && selectedPeers.length > 0 ? (
          <View testID="dm-selected-peer-list" className="mb-4 flex-row flex-wrap" style={{gap: 6}}>
            {selectedPeers.map(did => (
              <View
                key={did}
                testID={`dm-selected-peer-${did}`}
                className="rounded-pill border border-primary bg-primary-soft px-2 py-1">
                <Text className="text-xs text-text">{participantLabels.get(did) ?? did}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {!conversation ? (
          <View testID="dm-manual-did-entry" className="mb-4 flex-row items-end" style={{gap: 8}}>
            <View className="flex-1">
              <Input
                testID="dm-manual-did-input"
                placeholder="Enter a DID"
                value={manualDid}
                onChangeText={setManualDid}
              />
            </View>
            <Button
              testID="dm-manual-did-add-button"
              label="Add"
              onPress={addManualDid}
              disabled={manualDid.trim().length === 0}
            />
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
            {items
              .map(item => (deliveryStates ? applyDeliveryState(item, deliveryStates) : item))
              .map((item, index, renderItems) => {
              const previous = renderItems[index - 1];
              const showHeader =
                !previous ||
                previous.senderDid !== item.senderDid ||
                item.senderDid === undefined ||
                !withinGroupedWindow(previous, item);
              const replyTo = item.replyToId
                ? renderItems.find(existing => existing.id === item.replyToId) ?? null
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
                {item.attachments?.map((attachment, attachmentIndex) => (
                  <View
                    key={`${item.id}-attachment-${attachmentIndex}`}
                    testID={`dm-attachment-${item.id}-${attachmentIndex}`}
                    className="mt-2 rounded-md border border-border-soft bg-surface px-3 py-2">
                    {attachment.integrity_failed === true ? (
                      <Text
                        testID={`dm-attachment-integrity-failed-${item.id}-${attachmentIndex}`}
                        className="text-xs text-danger">
                        attachment integrity failed
                      </Text>
                    ) : isImageAttachment(attachment) && attachment.download_url ? (
                      <Image
                        testID={`dm-attachment-image-${item.id}-${attachmentIndex}`}
                        source={{uri: attachment.download_url as string}}
                        className="h-40 w-full rounded"
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="text-xs text-text-secondary">
                        {attachmentLabel(attachment)}
                      </Text>
                    )}
                  </View>
                ))}
                {item.delivery === 'queued' ? (
                  <Text
                    testID={`dm-queued-indicator-${item.id}`}
                    className="text-xs text-warning mt-1">
                    Queued — will send when you reconnect
                  </Text>
                ) : item.delivery === 'sending' ? (
                  <Text
                    testID={`dm-sending-indicator-${item.id}`}
                    className="text-xs text-text-tertiary mt-1">
                    Sending…
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

      {profilePeer ? (
        <View
          testID="dm-profile-sheet"
          className="absolute inset-0 items-end justify-end bg-overlay">
          <View className="w-full rounded-t-2xl border border-border-soft bg-surface px-6 py-5">
            <Text testID="dm-profile-name" className="text-xl font-bold text-text">
              {profilePeer.label}
            </Text>
            <Text
              testID={`dm-profile-fingerprint-${profilePeer.did}`}
              className="mt-3 text-sm text-text-secondary"
              style={{fontFamily: monospace}}>
              {fingerprintFromDid(profilePeer.did)}
            </Text>
            <View className="mt-5" style={{gap: 10}}>
              <Button
                testID={`dm-verify-peer-${profilePeer.did}`}
                label="Verify identity"
                onPress={() => {
                  setVerifyingPeer(profilePeer);
                  setCameraState('idle');
                }}
              />
              <Button
                testID="dm-profile-close-button"
                label="Close"
                variant="secondary"
                onPress={() => setProfilePeer(null)}
              />
            </View>
          </View>
        </View>
      ) : null}

      {verifyingPeer ? (
        <View
          testID="dm-verify-modal"
          className="absolute inset-0 items-center justify-center bg-overlay px-6">
          <View className="w-full max-w-lg rounded-xl border border-border-soft bg-surface px-5 py-5">
            <Text className="text-lg font-bold text-text">Verify identity</Text>
            <Text className="mt-2 text-sm text-text-secondary">
              Scan their QR code or compare this fingerprint out of band.
            </Text>
            <Text
              testID="dm-verify-fingerprint"
              className="mt-4 text-2xl text-primary"
              style={{fontFamily: monospace}}>
              {fingerprintFromDid(verifyingPeer.did)}
            </Text>
            <View className="mt-5" style={{gap: 10}}>
              <Button
                testID="dm-verify-qr-button"
                label="QR scan"
                onPress={() => startQrScan(verifyingPeer)}
              />
              {cameraState === 'scanning' ? (
                <Text testID="dm-qr-camera-scanning" className="text-xs text-text-secondary">
                  Scanning the peer's identity QR code.
                </Text>
              ) : cameraState === 'matched' ? (
                <Text testID="dm-qr-camera-matched" className="text-xs text-primary">
                  Identity QR matched.
                </Text>
              ) : cameraState === 'mismatch' ? (
                <Text testID="dm-qr-camera-mismatch" className="text-xs text-warning">
                  That QR code does not match this peer.
                </Text>
              ) : cameraState === 'unavailable' ? (
                <Text testID="dm-qr-camera-unavailable" className="text-xs text-warning">
                  Camera access is unavailable on this device.
                </Text>
              ) : null}
              <Button
                testID="dm-verify-oob-match-button"
                label="It matches"
                onPress={() => confirmPeer(verifyingPeer)}
              />
              <Button
                testID="dm-verify-cancel-button"
                label="Cancel"
                variant="secondary"
                onPress={() => setVerifyingPeer(null)}
              />
            </View>
          </View>
        </View>
      ) : null}

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
              {Platform.OS === 'web'
                ? React.createElement('input', {
                    'data-testid': 'dm-attachment-input',
                    type: 'file',
                    multiple: true,
                    onChange: (event: {target?: {files?: FileList | null}}) =>
                      handleAttachFiles(event.target?.files),
                  })
                : null}
              {pendingFiles.length > 0 ? (
                <Text testID="dm-attachment-pending-count" className="mt-1 text-xs text-text-secondary">
                  {pendingFiles.length} attachment{pendingFiles.length === 1 ? '' : 's'} selected
                </Text>
              ) : null}
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
  verifiedPeerDids,
  onTogglePin,
  onOpenConversation,
}: {
  title: string;
  conversations: DmConversation[];
  pinnedIds: Set<string>;
  verifiedPeerDids: Set<string>;
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
          const id = conversationKey(conversation);
          return (
            <View
              key={id}
              className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex-row items-center justify-between">
              <Pressable
                testID={`dm-conversation-${id}`}
                accessibilityRole="button"
                onPress={() => onOpenConversation?.(conversation)}
                style={pointerCursor}
                className="flex-1 flex-row items-center">
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center" style={{gap: 4}}>
                    {conversation.participants.map((participant, index) => (
                      <View
                        key={participant.did}
                        testID={`dm-conversation-peer-${id}-${participant.did}`}
                        className="flex-row items-center"
                        style={{gap: 3}}>
                        <Text className="text-sm font-bold text-text">
                          {index === 0 ? participant.label : `, ${participant.label}`}
                        </Text>
                        {verifiedPeerDids.has(participant.did) ? (
                          <Text
                            testID={`dm-peer-row-verified-${participant.did}`}
                            accessibilityLabel="verified peer"
                            className="text-xs text-primary">
                            🛡✓
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <Text className="text-xs text-text-tertiary" style={{fontFamily: monospace}}>
                    {id}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                testID={`dm-pin-${id}`}
                accessibilityRole="button"
                accessibilityLabel={pinnedIds.has(id) ? 'unpin peer' : 'pin peer'}
                onPress={() => onTogglePin(conversation)}
                style={pointerCursor}
                className="ml-2 px-3 py-1 rounded-pill bg-surface-2">
                <Text className="text-xs text-text-secondary">
                  {pinnedIds.has(id) ? 'Unpin' : 'Pin'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function conversationKey(conversation: DmConversation): string {
  return conversation.conversationId ?? conversation.participants.map(p => p.did).sort().join('|');
}

function sortPinned(
  conversations: DmConversation[],
  pinnedIds: Set<string>,
): DmConversation[] {
  return conversations
    .filter(c => pinnedIds.has(conversationKey(c)))
    .sort((a, b) => {
      const aIndex = Array.from(pinnedIds).indexOf(conversationKey(a));
      const bIndex = Array.from(pinnedIds).indexOf(conversationKey(b));
      return aIndex - bIndex;
    });
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

function verifiedPeerDids(meta: unknown): Set<string> {
  return new Set(
    peerVerificationRecords(meta)
      .filter(record => record.status === 'verified')
      .map(record => record.peer_did),
  );
}

function parseIdentityQrPayload(
  data: string | undefined,
): {did: string; master_pk: string; nonce: string} | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const did = typeof parsed.did === 'string' ? parsed.did : null;
    const masterPk =
      typeof parsed.master_pk === 'string'
        ? parsed.master_pk
        : typeof parsed.masterPk === 'string'
          ? parsed.masterPk
          : null;
    const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : null;
    if (!did || !masterPk || !nonce) return null;
    return {did, master_pk: masterPk, nonce};
  } catch {
    const params = new URLSearchParams(data);
    const did = params.get('did');
    const masterPk = params.get('master_pk') ?? params.get('masterPk');
    const nonce = params.get('nonce');
    if (!did || !masterPk || !nonce) return null;
    return {did, master_pk: masterPk, nonce};
  }
}

function fingerprintFromQrMasterPk(masterPk: string): string | null {
  try {
    return fingerprintFromPubkey(b64UrlToBytes(masterPk));
  } catch {
    return null;
  }
}

function attachmentLabel(attachment: Record<string, unknown>): string {
  const mime = typeof attachment.mime === 'string' ? attachment.mime : 'attachment';
  const size =
    typeof attachment.size === 'number'
      ? attachment.size
      : typeof attachment.size_bytes === 'number'
        ? attachment.size_bytes
        : null;
  return size === null ? mime : `${mime} · ${size} bytes`;
}

function isImageAttachment(attachment: Record<string, unknown>): boolean {
  return typeof attachment.mime === 'string' && attachment.mime.toLowerCase().startsWith('image/');
}

function updateAttachment(
  items: DmThreadMessage[],
  messageId: string,
  attachmentIndex: number,
  attachment: AttachmentDescriptor,
): DmThreadMessage[] {
  return items.map(item => {
    if (item.id !== messageId) return item;
    const attachments = [...(item.attachments ?? [])];
    attachments[attachmentIndex] = attachment;
    return {...item, attachments};
  });
}

function withinGroupedWindow(previous: DmThreadMessage, next: DmThreadMessage): boolean {
  const previousTime = new Date(previous.createdAt ?? 0).getTime();
  const nextTime = new Date(next.createdAt ?? 0).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false;
  if (previousTime <= 0 || nextTime <= 0) return false;
  return Math.abs(nextTime - previousTime) <= 300000;
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
