
import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {useIdentityState} from '../identity-context';
import {useSocketState} from '../auth';
import {useRoomList, type RoomSummary} from '../chat';

type Props = {
  onBack: () => void;
  onOpenRoom: (roomId: string) => void;
};

export function RoomListScreen({onBack, onOpenRoom}: Props) {
  const identity = useIdentityState();
  const {token, tokenLoaded} = useSocketState();

  const authedDid =
    tokenLoaded && token && identity.status === 'ready'
      ? identity.identity.did
      : null;

  const did =
    identity.status === 'ready' ? identity.identity.did : null;

  const {state, createRoom, joinRoom, refresh} = useRoomList(authedDid);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim() || creating || !authedDid) {
      return;
    }
    setCreating(true);
    const room = await createRoom(name);
    setCreating(false);
    if (room) {
      setName('');
      onOpenRoom(room.id);
    }
  }

  async function handleOpen(room: RoomSummary) {
    if (!authedDid) {
      return;
    }
    if (!room.members.includes(authedDid)) {
      await joinRoom(room.id);
    }
    onOpenRoom(room.id);
  }

  return (
    <View
      className="flex-1 bg-slate-900 px-6 pt-12 pb-6"
      nativeID="room-list-screen">
      <Text className="text-3xl font-bold text-slate-50 mb-2">Rooms</Text>
      <Text className="text-xs text-slate-400 mb-6 break-all">
        {did ? `As ${did}` : 'No identity yet'}
      </Text>

      {!authedDid ? (
        <View
          className="bg-slate-800 rounded-lg p-4 mb-6"
          testID="room-list-unauth"
          nativeID="room-list-unauth">
          <Text className="text-base text-amber-300 mb-2">
            Please authenticate
          </Text>
          <Text className="text-xs text-slate-400 leading-5">
            Go back and open the Authenticate screen first so you can
            join and create rooms.
          </Text>
        </View>
      ) : (
        <View className="bg-slate-800 rounded-lg p-4 mb-6">
          <Text className="text-sm font-semibold text-slate-300 mb-2">
            Create a room
          </Text>
          <TextInput
            className="border border-slate-600 rounded px-3 py-2 text-slate-50 mb-2"
            placeholder="Room name"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
            editable={!creating}
            testID="new-room-name"
            nativeID="new-room-name"
            autoCapitalize="none"
          />
          <Pressable
            onPress={handleCreate}
            disabled={creating || !name.trim()}
            accessibilityRole="button"
            testID="create-room-button"
            nativeID="create-room-button"
            className={`rounded py-2 px-4 self-start ${
              creating || !name.trim()
                ? 'bg-slate-700 opacity-50'
                : 'bg-emerald-600 active:bg-emerald-500'
            }`}>
            <Text className="text-sm font-semibold text-white">
              {creating ? 'Creating…' : 'Create Room'}
            </Text>
          </Pressable>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-slate-300">
          Available rooms
        </Text>
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          testID="refresh-rooms-button"
          nativeID="refresh-rooms-button"
          disabled={!authedDid}
          className="bg-slate-700 border border-slate-600 rounded px-3 py-1 active:bg-slate-600">
          <Text className="text-xs text-slate-50">Refresh</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 mb-4"
        nativeID="room-list"
        testID="room-list">
        {state.status === 'error' ? (
          <Text className="text-rose-300 text-xs mb-3" testID="room-list-error">
            {state.error}
          </Text>
        ) : null}
        {state.rooms.length === 0 ? (
          <Text
            className="text-slate-500 text-sm"
            testID="room-list-empty"
            nativeID="room-list-empty">
            {state.status === 'loading' ? 'Loading…' : 'No rooms yet.'}
          </Text>
        ) : (
          state.rooms.map(room => (
            <Pressable
              key={room.id}
              onPress={() => handleOpen(room)}
              accessibilityRole="button"
              testID={`room-item-${room.id}`}
              nativeID={`room-item-${room.id}`}
              {...({dataSet: {roomId: room.id}} as {
                dataSet: {roomId: string};
              })}
              className="bg-slate-800 rounded-lg p-3 mb-2 active:bg-slate-700">
              <Text className="text-base font-semibold text-slate-50">
                {room.name}
              </Text>
              <Text className="text-xs text-slate-500 mt-1">
                {room.members.length} member
                {room.members.length === 1 ? '' : 's'} · {room.id.slice(0, 8)}…
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        testID="rooms-back-button"
        className="bg-slate-700 border border-slate-600 rounded-lg py-2 px-4 self-start active:bg-slate-600">
        <Text className="text-sm font-semibold text-slate-50">Back</Text>
      </Pressable>
    </View>
  );
}
