
import React, {useCallback, useEffect, useState} from 'react';
import {Platform, StatusBar, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {acceptPeerRequest} from './ash_generated';
import {submitBindDevice} from './bind';
import {
  AnchorConnectionProvider,
  type DeliveryStateEvent,
  type InboxEvent,
} from './chat/anchor-connection';
import {normalizeAnchorServerUrl} from './chat/anchor-url';
import {discoverGeneralChannel} from './chat/discover';
import {submitDm} from './chat/dm-submit';
import type {RecentDm} from './chat/TabRow';
import {
  IdentityProvider,
  useIdentityState,
  useBundleMetadata,
  useWorkspaceServers,
  type Identity,
  type WorkspaceServer,
} from './identity-context';
import {AddAnchorScreen} from './screens/AddAnchorScreen';
import {AddServerScreen} from './screens/AddServerScreen';
import {DmListScreen, type DmConversation} from './screens/DmListScreen';
import {HomeScreen} from './screens/HomeScreen';
import {ServerScreen} from './screens/ServerScreen';
import {LockedScreen} from './screens/LockedScreen';
import {DegradedModeBanner} from './screens/DegradedModeBanner';
import {OnboardingFlow} from './screens/OnboardingFlow';
import {PassphraseSettingsScreen} from './screens/PassphraseSettingsScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {WorkspaceBar} from './screens/WorkspaceBar';
import {getValidSessionToken} from './session';

export async function ensureSession(
  serverUrl: string,
  identity: Identity,
): Promise<{ok: true} | {ok: false; error: string; message: string}> {
  const session = await getValidSessionToken({serverUrl});
  if (session.ok) return {ok: true};

  const bind = await submitBindDevice({serverUrl, identity});
  if (bind.ok) return {ok: true};
  return {ok: false, error: bind.error, message: bind.message};
}

type Screen =
  | {kind: 'home'}
  | {kind: 'vector'}
  | {kind: 'add-server'}
  | {kind: 'add-anchor'}
  | {kind: 'passphrase-settings'}
  | {kind: 'dm'}
  | {
      kind: 'channel';
      serverUrl: string;
      serverId: string;
      serverLabel: string;
      channelId: string;
      channelName: string;
    };

export default function App() {
  return (
    <SafeAreaProvider>
      <IdentityProvider>
        <AppShell />
      </IdentityProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const identityState = useIdentityState();
  const {metadata} = useBundleMetadata();
  const {servers, removeServer} = useWorkspaceServers();
  const anchorUrls = configuredAnchorUrls(metadata.publishedProfile?.anchors);
  const dmPeers = dmAvailablePeers(
    metadata,
    identityState.status === 'ready' ? identityState.identity.didFull : null,
  );
  const guestAnchors = guestAnchorHosts(servers, anchorUrls);
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [bindingUrl, setBindingUrl] = useState<string | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);
  const [dmConversation, setDmConversation] = useState<DmConversation | null>(null);
  const [inboxConversations, setInboxConversations] = useState<DmConversation[]>([]);

  function handleRemovedFromServer(serverUrl: string, reason: string) {
    if (reason === 'banned') {
      removeServer(serverUrl);
    }
    setScreen({kind: 'home'});
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#add-server') {
      setScreen({kind: 'add-server'});
    }
  }, []);

  async function handleSelectServer(server: WorkspaceServer) {
    if (identityState.status !== 'ready') return;
    setBindError(null);
    setBindingUrl(server.url);
    try {
      const ensured = await ensureSession(server.url, identityState.identity);
      if (!ensured.ok) {
        setBindError(ensured.message);
        return;
      }
      const general = await discoverGeneralChannel(server.url);
      if (!general) {
        return;
      }
      setScreen({
        kind: 'channel',
        serverUrl: server.url,
        serverId: general.serverId,
        serverLabel: server.label,
        channelId: general.id,
        channelName: general.name,
      });
    } finally {
      setBindingUrl(null);
    }
  }

  async function handleStartDmConversation(recipientDids: string[], body: string) {
    if (identityState.status !== 'ready') return;
    const uniqueRecipientDids = normalizeRecipientDids(recipientDids, identityState.identity.didFull);
    if (uniqueRecipientDids.length < 1) return;
    const trimmedBody = body.trim();
    if (trimmedBody.length < 1) return;
    const participants = participantsFromDids(uniqueRecipientDids, dmPeers);
    const createdAt = new Date().toISOString();
    const localId = `local-${createdAt}`;
    setDmConversation({
      participants,
      lastActivityAt: createdAt,
      messages: [
        {
          id: localId,
          body: trimmedBody,
          delivery: 'sending',
          senderDid: identityState.identity.didFull,
          recipientDids: uniqueRecipientDids,
          createdAt,
        },
      ],
    });
    const result = await submitDm({
      serverUrl: primaryAnchorUrl(anchorUrls),
      identity: identityState.identity,
      recipientDids: uniqueRecipientDids,
      body: trimmedBody,
    });
    if (!result.ok) {
      setDmConversation(prev =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map(message =>
                message.id === localId ? {...message, delivery: 'queued'} : message,
              ),
            }
          : prev,
      );
      return;
    }
    setDmConversation(prev =>
      prev
        ? {
            ...prev,
            conversationId: result.envelope.conversation_id,
            lastActivityAt: result.envelope.timestamp,
            messages: prev.messages.map(message =>
              message.id === localId
                ? {
                    ...message,
                    id: result.envelope.envelope_id,
                    delivery: result.delivery,
                    senderDid: result.envelope.sender_did,
                    recipientDids: result.envelope.recipient_dids,
                    createdAt: result.envelope.timestamp,
                  }
                : message,
            ),
          }
        : prev,
    );
    setInboxConversations(prev =>
      mergeInboxConversation(prev, {
        conversationId: result.envelope.conversation_id,
        participants,
        lastActivityAt: result.envelope.timestamp,
        messages: [
          {
            id: result.envelope.envelope_id,
            body: result.envelope.body,
            delivery: result.delivery,
            senderDid: result.envelope.sender_did,
            recipientDids: result.envelope.recipient_dids,
            createdAt: result.envelope.timestamp,
          },
        ],
      }),
    );
  }

  async function handleSendDmMessage(
    recipientDids: string[],
    body: string,
    conversationId?: string,
  ): Promise<{
    id: string;
    conversationId: string;
    delivery: 'sent';
    senderDid: string;
    recipientDids: string[];
    createdAt: string;
  } | null> {
    if (identityState.status !== 'ready') return null;
    const result = await submitDm({
      serverUrl: primaryAnchorUrl(anchorUrls),
      identity: identityState.identity,
      recipientDids: normalizeRecipientDids(recipientDids, identityState.identity.didFull),
      body,
    });
    if (!result.ok) return null;
    const message = {
      id: result.envelope.envelope_id,
      conversationId: result.envelope.conversation_id,
      delivery: result.delivery,
      senderDid: result.envelope.sender_did,
      recipientDids: result.envelope.recipient_dids,
      createdAt: result.envelope.timestamp,
    };
    setInboxConversations(prev =>
      mergeInboxConversation(prev, {
        conversationId: conversationId ?? result.envelope.conversation_id,
        participants: participantsFromDids(result.envelope.recipient_dids, dmPeers),
        lastActivityAt: result.envelope.timestamp,
        messages: [
          {
            id: result.envelope.envelope_id,
            body: result.envelope.body,
            delivery: result.delivery,
            senderDid: result.envelope.sender_did,
            recipientDids: result.envelope.recipient_dids,
            createdAt: result.envelope.timestamp,
          },
        ],
      }),
    );
    return message;
  }

  function handleSelectRecentDm(dm: RecentDm) {
    const conversation = inboxConversations.find(item => item.conversationId === dm.id);
    if (!conversation) return;
    setDmConversation(conversation);
    setScreen({kind: 'dm'});
  }

  function handleOpenDmList() {
    setDmConversation(null);
    setScreen({kind: 'dm'});
  }

  async function handleAcceptDmRequest(senderDid: string): Promise<boolean> {
    if (identityState.status !== 'ready') return false;
    const session = await getValidSessionToken({
      serverUrl: primaryAnchorUrl(anchorUrls),
    });
    if (!session.ok) return false;
    const result = await acceptPeerRequest({
      identity: {did: identityState.identity.didFull},
      input: {peerDid: senderDid},
      fields: ['did'],
      headers: {Authorization: `Bearer ${session.sessionToken}`},
    });
    if (result.success) {
      setInboxConversations(prev =>
        prev.map(conversation =>
          conversation.participants.some(participant => participant.did === senderDid)
            ? {...conversation, isRequest: false}
            : conversation,
        ),
      );
      setDmConversation(prev => (prev ? {...prev, isRequest: false} : prev));
    }
    return result.success;
  }

  const handleInbox = useCallback((event: InboxEvent) => {
    const conversation = conversationFromInboxEvent(event);
    if (!conversation) return;
    setInboxConversations(prev => mergeInboxConversation(prev, conversation));
    setDmConversation(prev => {
      if (!prev) return prev;
      return prev.conversationId === conversation.conversationId
        ? mergeInboxConversation([prev], conversation)[0]
        : prev;
    });
  }, []);

  const handleDeliveryState = useCallback((event: DeliveryStateEvent) => {
    setInboxConversations(prev => mergeDeliveryState(prev, event));
    setDmConversation(prev =>
      prev ? mergeDeliveryState([prev], event)[0] ?? prev : prev,
    );
  }, []);

  if (identityState.status === 'onboarding') {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-bg"
        nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <OnboardingFlow onDone={() => setScreen({kind: 'home'})} />
      </SafeAreaView>
    );
  }

  if (identityState.status === 'locked' || identityState.status === 'locked_native') {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-bg"
        nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <LockedScreen />
      </SafeAreaView>
    );
  }

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'home':
      body = (
        <HomeScreen
          bindError={bindError}
          onOpenPassphraseSettings={() =>
            setScreen({kind: 'passphrase-settings'})
          }
          onOpenAddServer={() => setScreen({kind: 'add-server'})}
          onOpenAddAnchor={() => setScreen({kind: 'add-anchor'})}
          onOpenVectorTest={() => setScreen({kind: 'vector'})}
          onClearBindError={() => setBindError(null)}
        />
      );
      break;
    case 'vector':
      body = <VectorTestScreen onBack={() => setScreen({kind: 'home'})} />;
      break;
    case 'add-server':
      body = (
        <AddServerScreen
          onCancel={() => setScreen({kind: 'home'})}
          onAdded={() => setScreen({kind: 'home'})}
          onNavigateToServer={server => {
            handleSelectServer(server);
          }}
        />
      );
      break;
    case 'add-anchor':
      body = (
        <AddAnchorScreen
          onCancel={() => setScreen({kind: 'home'})}
          onAdded={() => setScreen({kind: 'home'})}
        />
      );
      break;
    case 'passphrase-settings':
      body = (
        <PassphraseSettingsScreen onBack={() => setScreen({kind: 'home'})} />
      );
      break;
    case 'dm':
      body = (
        <DmListScreen
          onBack={() => setScreen({kind: 'home'})}
          availablePeers={dmPeers}
          conversation={dmConversation ?? undefined}
          conversations={dmConversation ? undefined : inboxConversations}
          onStartConversation={handleStartDmConversation}
          onSendMessage={handleSendDmMessage}
          onAcceptRequest={handleAcceptDmRequest}
          onOpenConversation={setDmConversation}
        />
      );
      break;
    case 'channel':
      body = (
        <ServerScreen
          serverUrl={screen.serverUrl}
          serverId={screen.serverId}
          serverLabel={screen.serverLabel}
          initialChannelId={screen.channelId}
          initialChannelName={screen.channelName}
          onBack={() => setScreen({kind: 'home'})}
          onOpenDmList={handleOpenDmList}
          recentDms={recentDmsFromConversations(inboxConversations)}
          onSelectRecentDm={handleSelectRecentDm}
          onRemoved={reason => handleRemovedFromServer(screen.serverUrl, reason)}
        />
      );
      break;
  }

  return (
    <AnchorConnectionProvider
      anchorUrls={anchorUrls}
      guestAnchors={guestAnchors}
      onInbox={handleInbox}
      onDeliveryState={handleDeliveryState}>
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-bg"
        nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <View style={{flex: 1, flexDirection: 'column'}}>
          <WorkspaceBar
            onAddServer={() => setScreen({kind: 'add-server'})}
            onSelectServer={handleSelectServer}
            onSelectDm={handleOpenDmList}
            dmActive={screen.kind === 'dm'}
            activeServerUrl={
              screen.kind === 'channel' ? screen.serverUrl : null
            }
            bindingUrl={bindingUrl}
          />
          <DegradedModeBanner />
          <View style={{flex: 1}}>{body}</View>
        </View>
      </SafeAreaView>
    </AnchorConnectionProvider>
  );
}

function primaryAnchorUrl(anchorUrls: string[]): string {
  return anchorUrls[0] ?? '';
}

function normalizeRecipientDids(recipientDids: string[], currentDid: string): string[] {
  return Array.from(
    new Set(
      recipientDids
        .map(did => did.trim())
        .filter(did => did.length > 0 && did !== currentDid),
    ),
  );
}

function participantsFromDids(
  recipientDids: string[],
  knownPeers: Array<{did: string; label: string}>,
): Array<{did: string; label: string}> {
  return recipientDids.map(did => knownPeers.find(peer => peer.did === did) ?? {did, label: dmPeerLabel(did)});
}

function conversationFromInboxEvent(event: InboxEvent): DmConversation | null {
  const envelope = event.envelope;
  const senderDid = typeof envelope.sender_did === 'string' ? envelope.sender_did : null;
  const conversationId =
    typeof envelope.conversation_id === 'string' ? envelope.conversation_id : event.envelope_id;
  if (!senderDid) return null;
  const recipientDids = Array.isArray(envelope.recipient_dids)
    ? envelope.recipient_dids.filter((did): did is string => typeof did === 'string')
    : [];
  const participants = Array.from(new Set([senderDid, ...recipientDids])).map(did => ({
    did,
    label: dmPeerLabel(did),
  }));
  return {
    conversationId,
    participants,
    lastActivityAt: typeof envelope.timestamp === 'string' ? envelope.timestamp : new Date(0).toISOString(),
    isRequest: event.is_request,
    messages: [
      {
        id: event.envelope_id,
        body: typeof envelope.body === 'string' ? envelope.body : '',
        senderDid,
        recipientDids,
        delivery: 'delivered',
        createdAt: typeof envelope.timestamp === 'string' ? envelope.timestamp : undefined,
      },
    ],
  };
}

export function recentDmsFromConversations(
  conversations: DmConversation[],
): RecentDm[] {
  return [...conversations]
    .filter(conversation => !conversation.isRequest)
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt ?? 0).getTime() -
        new Date(a.lastActivityAt ?? 0).getTime(),
    )
    .slice(0, 5)
    .map(conversation => {
      const id =
        conversation.conversationId ??
        conversation.participants.map(participant => participant.did).sort().join('|');
      return {
        id,
        label:
          conversation.participants.map(participant => participant.label).join(', ') ||
          'Direct message',
      };
    });
}

function mergeInboxConversation(
  conversations: DmConversation[],
  incoming: DmConversation,
): DmConversation[] {
  const id = incoming.conversationId;
  const existingIndex = conversations.findIndex(conversation => conversation.conversationId === id);
  if (existingIndex < 0) return [incoming, ...conversations];
  return conversations.map((conversation, index) => {
    if (index !== existingIndex) return conversation;
    const known = new Set(conversation.messages.map(message => message.id));
    const participantDids = new Set(conversation.participants.map(participant => participant.did));
    return {
      ...conversation,
      participants: [
        ...conversation.participants,
        ...incoming.participants.filter(participant => !participantDids.has(participant.did)),
      ],
      isRequest: incoming.isRequest,
      lastActivityAt: incoming.lastActivityAt,
      messages: [
        ...conversation.messages,
        ...incoming.messages.filter(message => !known.has(message.id)),
      ],
    };
  });
}

function mergeDeliveryState(
  conversations: DmConversation[],
  incoming: DeliveryStateEvent,
): DmConversation[] {
  return conversations.map(conversation => ({
    ...conversation,
    messages: conversation.messages.map(message => {
      if (message.id !== incoming.envelope_id) return message;
      const existing = message.deliveryStates ?? [];
      const withoutRecipient = existing.filter(
        state => state.recipientDid !== incoming.recipient_did,
      );
      return {
        ...message,
        delivery: incoming.state,
        deliveryStates: [
          ...withoutRecipient,
          {recipientDid: incoming.recipient_did, state: incoming.state},
        ],
      };
    }),
  }));
}

export function configuredAnchorUrls(anchors: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (anchors ?? [])
        .map(normalizeAnchorServerUrl)
        .filter((anchor): anchor is string => Boolean(anchor)),
    ),
  );
}

export function guestAnchorHosts(
  servers: WorkspaceServer[],
  anchorUrls: string[],
): string[] {
  const anchorHosts = new Set(anchorUrls.map(hostFromUrl).filter(Boolean));
  return Array.from(
    new Set(
      servers
        .map(server => hostFromUrl(server.url))
        .filter((host): host is string => Boolean(host) && !anchorHosts.has(host)),
    ),
  );
}

function hostFromUrl(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

export function dmAvailablePeers(
  metadata: unknown,
  currentDid: string | null,
): Array<{did: string; label: string}> {
  if (!metadata || typeof metadata !== 'object') return [];
  const acceptedPeers = (metadata as {acceptedPeers?: unknown}).acceptedPeers;
  if (!Array.isArray(acceptedPeers)) return [];
  return Array.from(
    new Set(
      acceptedPeers.filter(
        (did): did is string =>
          typeof did === 'string' && did.length > 0 && did !== currentDid,
      ),
    ),
  ).map(did => ({did, label: dmPeerLabel(did)}));
}

function dmPeerLabel(did: string): string {
  const suffix = did.split(':').pop();
  return suffix && suffix.length > 0 ? suffix : did;
}
