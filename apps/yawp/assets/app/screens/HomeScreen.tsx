
import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {useSecondAnchorNudge} from '../nudge-store';
import {useWorkspaceServers} from '../identity-context';
import {DidScreen} from './DidScreen';

type Props = {
  bindError: string | null;
  onOpenPassphraseSettings: () => void;
  onOpenAddServer: () => void;
  onOpenVectorTest: () => void;
  onClearBindError: () => void;
};

export function HomeScreen({
  bindError,
  onOpenPassphraseSettings,
  onOpenAddServer,
  onOpenVectorTest,
  onClearBindError,
}: Props) {
  const {servers} = useWorkspaceServers();
  const {visible: showNudge, dismiss} = useSecondAnchorNudge(servers.length);

  return (
    <View style={{flex: 1}}>
      <View className="flex-row justify-end px-4 pt-4">
        <Pressable
          testID="open-passphrase-settings-btn"
          accessibilityRole="button"
          accessibilityLabel="open passphrase settings"
          onPress={onOpenPassphraseSettings}
          className="rounded-lg py-1 px-3 bg-slate-700 active:bg-slate-600 border border-slate-600">
          <Text className="text-xs font-semibold text-slate-50">
            Passphrase settings
          </Text>
        </Pressable>
      </View>

      {showNudge ? (
        <View
          testID="second-anchor-nudge"
          accessibilityLabel="second anchor nudge"
          className="bg-indigo-950 border border-indigo-700 rounded-lg p-3 mx-4 mt-4">
          <Text className="text-sm font-semibold text-indigo-100 mb-1">
            Add a second anchor for redundancy
          </Text>
          <Text className="text-sm text-indigo-200 mb-3">
            If your home anchor goes offline, a second anchor keeps your
            identity reachable.
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              testID="second-anchor-nudge-cta"
              accessibilityRole="button"
              accessibilityLabel="add a second anchor"
              onPress={onOpenAddServer}
              className="rounded-lg py-1 px-3 bg-indigo-500 active:bg-indigo-400">
              <Text className="text-xs font-semibold text-slate-50">
                Add a second anchor
              </Text>
            </Pressable>
            <Pressable
              testID="second-anchor-nudge-dismiss"
              accessibilityRole="button"
              accessibilityLabel="dismiss second anchor nudge"
              onPress={dismiss}
              className="rounded-lg py-1 px-3 bg-slate-700 border border-slate-600 active:bg-slate-600">
              <Text className="text-xs font-semibold text-slate-50">
                Dismiss
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
              onClearBindError();
              onOpenAddServer();
            }}
            className="self-start rounded-lg py-1 px-3 bg-indigo-500 active:bg-indigo-400">
            <Text className="text-xs font-semibold text-slate-50">
              Re-add server
            </Text>
          </Pressable>
        </View>
      ) : null}

      <DidScreen onOpenVectorTest={onOpenVectorTest} />
    </View>
  );
}
