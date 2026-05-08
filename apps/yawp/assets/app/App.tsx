
import React, {useEffect, useState} from 'react';
import {Platform, Pressable, StatusBar, Text, View, useWindowDimensions} from 'react-native';

import {submitBindDevice} from './bind';
import {discoverGeneralChannel} from './chat/discover';
import {
  IdentityProvider,
  useIdentityState,
  type Identity,
  type WorkspaceServer,
} from './identity-context';
import {AddServerScreen} from './screens/AddServerScreen';
import {ChannelScreen} from './screens/ChannelScreen';
import {DidScreen} from './screens/DidScreen';
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
  | {
      kind: 'channel';
      serverUrl: string;
      serverLabel: string;
      channelId: string;
      channelName: string;
    };

const MOBILE_BREAKPOINT = 480;

export default function App() {
  return (
    <IdentityProvider>
      <AppShell />
    </IdentityProvider>
  );
}

function AppShell() {
  const identityState = useIdentityState();
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
  const [bindingUrl, setBindingUrl] = useState<string | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);
  const {width} = useWindowDimensions();
  const horizontalBar = Platform.OS !== 'web' || width < MOBILE_BREAKPOINT;

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
      <View className="flex-1 bg-slate-900" nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <OnboardingFlow onDone={() => setScreen({kind: 'home'})} />
      </View>
    );
  }

  if (identityState.status === 'locked') {
    return (
      <View className="flex-1 bg-slate-900" nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        <LockedScreen />
      </View>
    );
  }

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'home':
      body = (
        <View style={{flex: 1}}>
          <View className="flex-row justify-end px-4 pt-4">
            <Pressable
              testID="open-passphrase-settings-btn"
              accessibilityRole="button"
              accessibilityLabel="open passphrase settings"
              onPress={() => setScreen({kind: 'passphrase-settings'})}
              className="rounded-lg py-1 px-3 bg-slate-700 active:bg-slate-600 border border-slate-600">
              <Text className="text-xs font-semibold text-slate-50">
                Passphrase settings
              </Text>
            </Pressable>
          </View>
          {bindError ? (
            <View
              testID="bind-error-banner"
              accessibilityLabel="bind error"
              className="bg-rose-950 border border-rose-700 rounded-lg p-3 mx-4 mt-4">
              <Text className="text-sm text-rose-100 mb-2">{bindError}</Text>
              <Pressable
                testID="bind-error-readd"
                accessibilityRole="button"
                accessibilityLabel="re-add server"
                onPress={() => {
                  setBindError(null);
                  setScreen({kind: 'add-server'});
                }}
                className="self-start rounded-lg py-1 px-3 bg-indigo-500 active:bg-indigo-400">
                <Text className="text-xs font-semibold text-slate-50">
                  Re-add server
                </Text>
              </Pressable>
            </View>
          ) : null}
          <DidScreen onOpenVectorTest={() => setScreen({kind: 'vector'})} />
        </View>
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
        />
      );
      break;
    case 'passphrase-settings':
      body = (
        <PassphraseSettingsScreen onBack={() => setScreen({kind: 'home'})} />
      );
      break;
    case 'channel':
      body = (
        <ChannelScreen
          serverUrl={screen.serverUrl}
          serverLabel={screen.serverLabel}
          channelId={screen.channelId}
          channelName={screen.channelName}
          onBack={() => setScreen({kind: 'home'})}
        />
      );
      break;
  }

  return (
    <View className="flex-1 bg-slate-900" nativeID="app-root">
      {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
      <View
        style={{
          flex: 1,
          flexDirection: horizontalBar ? 'column' : 'row',
        }}>
        <WorkspaceBar
          orientation={horizontalBar ? 'horizontal' : 'vertical'}
          onAddServer={() => setScreen({kind: 'add-server'})}
          onSelectServer={handleSelectServer}
          bindingUrl={bindingUrl}
        />
        <View style={{flex: 1}}>{body}</View>
      </View>
    </View>
  );
}
