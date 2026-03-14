
import React, {useState} from 'react';
import {Platform, StatusBar, View} from 'react-native';

import {IdentityProvider} from './identity-context';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';

type Screen = {kind: 'home'} | {kind: 'vector'};

export default function App() {
  const [screen, setScreen] = useState<Screen>({kind: 'home'});

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'home':
      body = <DidScreen onOpenVectorTest={() => setScreen({kind: 'vector'})} />;
      break;
    case 'vector':
      body = <VectorTestScreen onBack={() => setScreen({kind: 'home'})} />;
      break;
  }

  return (
    <IdentityProvider>
      <View className="flex-1 bg-slate-900" nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        {body}
      </View>
    </IdentityProvider>
  );
}
