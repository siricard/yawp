
import React, {useState} from 'react';
import {Platform, Pressable, StatusBar, Text, View} from 'react-native';

import {IdentityProvider} from './identity-context';
import {SocketProvider} from './auth';
import {DidScreen} from './screens/DidScreen';
import {VectorTestScreen} from './screens/VectorTestScreen';
import {AuthScreen} from './screens/AuthScreen';
import {RoomListScreen} from './screens/RoomListScreen';
import {RoomScreen} from './screens/RoomScreen';
import {CallLauncherScreen} from './screens/CallLauncherScreen';
import {CallScreen} from './screens/CallScreen';

type Screen =
  | {kind: 'home'}
  | {kind: 'vector'}
  | {kind: 'auth'}
  | {kind: 'roomList'}
  | {kind: 'room'; roomId: string}
  | {kind: 'callLauncher'}
  | {kind: 'call'; peerDid: string};

export default function App() {
  const [screen, setScreen] = useState<Screen>({kind: 'home'});

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'home':
      body = (
        <DidScreenWithNav
          onOpenVectorTest={() => setScreen({kind: 'vector'})}
          onOpenAuth={() => setScreen({kind: 'auth'})}
          onOpenRooms={() => setScreen({kind: 'roomList'})}
          onOpenCall={() => setScreen({kind: 'callLauncher'})}
        />
      );
      break;
    case 'vector':
      body = <VectorTestScreen onBack={() => setScreen({kind: 'home'})} />;
      break;
    case 'auth':
      body = <AuthScreen onBack={() => setScreen({kind: 'home'})} />;
      break;
    case 'roomList':
      body = (
        <RoomListScreen
          onBack={() => setScreen({kind: 'home'})}
          onOpenRoom={roomId => setScreen({kind: 'room', roomId})}
        />
      );
      break;
    case 'room':
      body = (
        <RoomScreen
          roomId={screen.roomId}
          onBack={() => setScreen({kind: 'roomList'})}
        />
      );
      break;
    case 'callLauncher':
      body = (
        <CallLauncherScreen
          onBack={() => setScreen({kind: 'home'})}
          onStartCall={peerDid => setScreen({kind: 'call', peerDid})}
        />
      );
      break;
    case 'call':
      body = (
        <CallScreen
          peerDid={screen.peerDid}
          onHangUp={() => setScreen({kind: 'home'})}
        />
      );
      break;
  }

  return (
    <IdentityProvider>
      <SocketProvider>
        <View className="flex-1 bg-slate-900" nativeID="app-root">
          {Platform.OS !== 'web' ? <StatusBar barStyle="light-content" /> : null}
          {body}
        </View>
      </SocketProvider>
    </IdentityProvider>
  );
}

function DidScreenWithNav({
  onOpenVectorTest,
  onOpenAuth,
  onOpenRooms,
  onOpenCall,
}: {
  onOpenVectorTest: () => void;
  onOpenAuth: () => void;
  onOpenRooms: () => void;
  onOpenCall: () => void;
}) {
  return (
    <View className="flex-1 bg-slate-900">
      <DidScreen onOpenVectorTest={onOpenVectorTest} />
      <View className="px-6 pb-6 flex-row gap-2 flex-wrap">
        <Pressable
          accessibilityRole="button"
          onPress={onOpenAuth}
          testID="open-auth-screen"
          nativeID="open-auth-screen"
          className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 active:bg-slate-600">
          <Text className="text-sm font-semibold text-slate-50">
            Authenticate
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenRooms}
          testID="open-rooms-screen"
          nativeID="open-rooms-screen"
          className="bg-emerald-600 rounded-lg py-2 px-4 active:bg-emerald-500">
          <Text className="text-sm font-semibold text-white">Rooms</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCall}
          testID="open-call-screen"
          nativeID="open-call-screen"
          className="bg-indigo-600 rounded-lg py-2 px-4 active:bg-indigo-500">
          <Text className="text-sm font-semibold text-white">Call</Text>
        </Pressable>
      </View>
    </View>
  );
}
