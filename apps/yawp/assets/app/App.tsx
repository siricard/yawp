
import React, {useEffect, useState} from 'react';
import {Platform, StatusBar, View, useWindowDimensions} from 'react-native';

import {discoverGeneralChannel} from './chat/discover';
import {IdentityProvider, type WorkspaceServer} from './identity-context';
import {AddServerScreen} from './screens/AddServerScreen';
import {ChannelScreen} from './screens/ChannelScreen';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {WorkspaceBar} from './screens/WorkspaceBar';

type Screen =
  | {kind: 'home'}
  | {kind: 'vector'}
  | {kind: 'add-server'}
  | {
      kind: 'channel';
      serverUrl: string;
      serverLabel: string;
      channelId: string;
      channelName: string;
    };

const MOBILE_BREAKPOINT = 480;

export default function App() {
  const [screen, setScreen] = useState<Screen>({kind: 'home'});
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
  }

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'home':
      body = <DidScreen onOpenVectorTest={() => setScreen({kind: 'vector'})} />;
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
    <IdentityProvider>
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
          />
          <View style={{flex: 1}}>{body}</View>
        </View>
      </View>
    </IdentityProvider>
  );
}
