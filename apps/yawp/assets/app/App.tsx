
import React, {useEffect, useState} from 'react';
import {Platform, StatusBar, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {submitBindDevice} from './bind';
import {discoverGeneralChannel} from './chat/discover';
import {
  IdentityProvider,
  useIdentityState,
  type Identity,
  type WorkspaceServer,
} from './identity-context';
import {AddServerScreen} from './screens/AddServerScreen';
import {DmListScreen} from './screens/DmListScreen';
import {HomeScreen} from './screens/HomeScreen';
import {ServerScreen} from './screens/ServerScreen';
import {LockedScreen} from './screens/LockedScreen';
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
  | {kind: 'passphrase-settings'}
  | {kind: 'dm'}
  | {
      kind: 'channel';
      serverUrl: string;
      serverId: string;
      serverLabel: string;
      serverRole: string;
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
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [bindingUrl, setBindingUrl] = useState<string | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);

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
        serverRole: server.role,
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
          role={screen.serverRole}
          initialChannelId={screen.channelId}
          initialChannelName={screen.channelName}
          onBack={() => setScreen({kind: 'home'})}
        />
      );
      break;
  }

  return (
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
        <View style={{flex: 1}}>{body}</View>
      </View>
    </SafeAreaView>
  );
}
