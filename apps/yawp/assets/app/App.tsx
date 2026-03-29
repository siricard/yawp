
import React, {useEffect, useState} from 'react';
import {Platform, StatusBar, View, useWindowDimensions} from 'react-native';

import {IdentityProvider} from './identity-context';
import {AddServerScreen} from './screens/AddServerScreen';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {WorkspaceBar} from './screens/WorkspaceBar';

type Screen = {kind: 'home'} | {kind: 'vector'} | {kind: 'add-server'};

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
          />
          <View style={{flex: 1}}>{body}</View>
        </View>
      </View>
    </IdentityProvider>
  );
}
