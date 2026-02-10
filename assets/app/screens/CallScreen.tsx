
import React, {useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';

import {useCall, RemoteAudio} from '../call';

type Props = {
  peerDid: string;
  onHangUp: () => void;
};

const monospace = Platform.select({
  ios: 'Menlo',
  macos: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

function statusToText(status: ReturnType<typeof useCall>['status']): string {
  switch (status.status) {
    case 'idle':
      return 'Idle';
    case 'requesting_media':
      return 'Requesting microphone…';
    case 'joining':
      return 'Joining call channel…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'closed':
      return 'Closed';
    case 'error':
      return `Error: ${status.reason}`;
    case 'unsupported':
      return 'Calls available on web only';
  }
}

export function CallScreen({peerDid, onHangUp}: Props) {
  const [remoteStream, setRemoteStream] = useState<unknown>(null);
  const {status, isCaller, hangUp} = useCall(peerDid, stream => {
    setRemoteStream(stream);
  });

  const isWeb = Platform.OS === 'web';

  function handleHangUp() {
    hangUp();
    setRemoteStream(null);
    onHangUp();
  }

  const statusText = statusToText(status);
  const isClosed = status.status === 'closed';

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="call-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">
        {isCaller ? 'Calling…' : 'Incoming'}
      </Text>
      <Text
        className="text-xs text-slate-400 mb-6 break-all"
        style={{fontFamily: monospace}}>
        Peer: {peerDid}
      </Text>

      <View
        className="bg-slate-800 rounded-lg p-4 mb-6"
        testID="call-status-card">
        <Text className="text-sm font-semibold text-slate-400 mb-1">
          Status
        </Text>
        <Text
          className="text-base text-slate-50"
          testID="call-status-text"
          nativeID="call-status-text"
          style={{fontFamily: monospace}}>
          {statusText}
        </Text>
      </View>

      {isWeb ? <RemoteAudio stream={remoteStream} /> : null}

      {!isWeb ? (
        <View
          className="bg-slate-800 rounded-lg p-4 mb-6"
          testID="call-native-placeholder"
          nativeID="call-native-placeholder">
          <Text className="text-sm text-amber-300 leading-5">
            Phase 0: voice calls are available on the web client only.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={handleHangUp}
        disabled={isClosed}
        testID="hang-up-button"
        nativeID="hang-up-button"
        className={`rounded-lg py-2 px-4 self-start ${
          isClosed
            ? 'bg-slate-700 opacity-50'
            : 'bg-rose-600 active:bg-rose-500'
        }`}>
        <Text className="text-sm font-semibold text-white">Hang Up</Text>
      </Pressable>
    </View>
  );
}
