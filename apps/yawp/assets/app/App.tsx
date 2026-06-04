
import React, {useEffect, useState} from 'react';
import {Platform, StatusBar, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {submitBindDevice} from './bind';
import {AnchorConnectionProvider} from './chat/anchor-connection';
import {discoverGeneralChannel} from './chat/discover';
import {
  IdentityProvider,
  useIdentityState,
  useWorkspaceServers,
  type Identity,
  type WorkspaceServer,
} from './identity-context';
import {AddAnchorScreen} from './screens/AddAnchorScreen';
import {AddServerScreen} from './screens/AddServerScreen';
import {DmListScreen} from './screens/DmListScreen';
import {HomeScreen} from './screens/HomeScreen';
import {ServerScreen} from './screens/ServerScreen';
import {LockedScreen} from './screens/LockedScreen';
import {DegradedModeBanner} from './screens/DegradedModeBanner';
import {OnboardingFlow} from './screens/OnboardingFlow';
import {PassphraseSettingsScreen} from './screens/PassphraseSettingsScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {WorkspaceBar} from './screens/WorkspaceBar';
import {getValidSessionToken} from './session';

/**
 * lazy auto-bind on server-tile click. If we have no
 * session for `serverUrl` (or the stored one is within 30s of
 * expiring), transparently call `submitBindDevice` so the channel
 * path always has a usable Bearer token. Returns ok=false with a
 * humanized error message on failure so the caller can show a banner.
 */
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
  const {servers, removeServer} = useWorkspaceServers();
  const anchorUrls = servers.map(s => s.url);
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [bindingUrl, setBindingUrl] = useState<string | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);

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

  if (identityState.status === 'locked') {
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
      body = <DmListScreen onBack={() => setScreen({kind: 'home'})} />;
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
          onOpenDmList={() => setScreen({kind: 'dm'})}
          onRemoved={reason => handleRemovedFromServer(screen.serverUrl, reason)}
        />
      );
      break;
  }

  return (
    <AnchorConnectionProvider anchorUrls={anchorUrls}>
      <SafeAreaView
        edges={['top', 'bottom']}
        className="flex-1 bg-bg"
        nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <View style={{flex: 1, flexDirection: 'column'}}>
          <WorkspaceBar
            onAddServer={() => setScreen({kind: 'add-server'})}
            onSelectServer={handleSelectServer}
            onSelectDm={() => setScreen({kind: 'dm'})}
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
