
import React, {useState} from 'react';
import {Platform, StatusBar, View} from 'react-native';

import {IdentityProvider} from './identity-context';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';

type Screen = 'home' | 'vector';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <IdentityProvider>
      <View className="flex-1 bg-slate-900" nativeID="app-root">
        {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
        {screen === 'home' ? (
          <DidScreen onOpenVectorTest={() => setScreen('vector')} />
        ) : (
          <VectorTestScreen onBack={() => setScreen('home')} />
        )}
      </View>
    </IdentityProvider>
  );
}
