
import React, {useState} from 'react';
import {Platform, Pressable, StatusBar, Text, View} from 'react-native';

import {IdentityProvider} from './identity-context';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {AuthScreen} from './screens/AuthScreen';

type Screen = 'home' | 'vector' | 'auth';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  let body: React.ReactNode;
  switch (screen) {
    case 'home':
      body = (
        <DidScreenWithNav
          onOpenVectorTest={() => setScreen('vector')}
          onOpenAuth={() => setScreen('auth')}
        />
      );
      break;
    case 'vector':
      body = <VectorTestScreen onBack={() => setScreen('home')} />;
      break;
    case 'auth':
      body = <AuthScreen onBack={() => setScreen('home')} />;
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

function DidScreenWithNav({
  onOpenVectorTest,
  onOpenAuth,
}: {
  onOpenVectorTest: () => void;
  onOpenAuth: () => void;
}) {
  return (
    <View className="flex-1 bg-slate-900">
      <DidScreen onOpenVectorTest={onOpenVectorTest} />
      <View className="px-6 pb-6">
        <Pressable
          accessibilityRole="button"
          onPress={onOpenAuth}
          testID="open-auth-screen"
          className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 self-start active:bg-slate-600">
          <Text className="text-sm font-semibold text-slate-50">
            Authenticate
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
