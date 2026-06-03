
import React from 'react';
import {View} from 'react-native';

import {useSecondAnchorNudge} from '../nudge-store';
import {useWorkspaceServers} from '../identity-context';
import {Banner, Button} from '../ui';
import {DidScreen} from './DidScreen';

type Props = {
  bindError: string | null;
  onOpenPassphraseSettings: () => void;
  onOpenAddServer: () => void;
  onOpenAddAnchor: () => void;
  onOpenVectorTest: () => void;
  onClearBindError: () => void;
};

export function HomeScreen({
  bindError,
  onOpenPassphraseSettings,
  onOpenAddServer,
  onOpenAddAnchor,
  onOpenVectorTest,
  onClearBindError,
}: Props) {
  const {servers} = useWorkspaceServers();
  const {visible: showNudge, dismiss} = useSecondAnchorNudge(servers.length);

  return (
    <View style={{flex: 1}} className="bg-bg">
      <View className="flex-row justify-end px-6 pt-6">
        <Button
          testID="open-passphrase-settings-btn"
          accessibilityLabel="open passphrase settings"
          variant="secondary"
          size="sm"
          label="Passphrase settings"
          onPress={onOpenPassphraseSettings}
        />
      </View>

      {showNudge ? (
        <View className="mx-6 mt-4">
          <Banner
            kind="info"
            testID="second-anchor-nudge"
            title="Add a second anchor for redundancy"
            message="If your home anchor goes offline, a second anchor keeps your identity reachable."
            actions={
              <>
                <Button
                  testID="second-anchor-nudge-cta"
                  accessibilityLabel="add a second anchor"
                  variant="primary"
                  size="sm"
                  label="Add a second anchor"
                  onPress={onOpenAddAnchor}
                />
                <Button
                  testID="second-anchor-nudge-dismiss"
                  accessibilityLabel="dismiss second anchor nudge"
                  variant="secondary"
                  size="sm"
                  label="Dismiss"
                  onPress={dismiss}
                />
              </>
            }
          />
        </View>
      ) : null}

      {bindError ? (
        <View className="mx-6 mt-4">
          <Banner
            kind="danger"
            testID="bind-error-banner"
            message={bindError}
            actions={
              <Button
                testID="bind-error-readd"
                accessibilityLabel="re-add server"
                variant="primary"
                size="sm"
                label="Re-add server"
                onPress={() => {
                  onClearBindError();
                  onOpenAddServer();
                }}
              />
            }
          />
        </View>
      ) : null}

      <DidScreen onOpenVectorTest={onOpenVectorTest} />
    </View>
  );
}
