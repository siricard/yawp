import React from 'react';
import {View} from 'react-native';

import {useAnchorStatus} from '../chat/anchor-connection';
import {Banner} from '../ui';

export function DegradedModeBanner() {
  const {degraded} = useAnchorStatus();
  if (!degraded) return null;

  return (
    <View className="px-3 pt-2">
      <Banner
        testID="degraded-mode-banner"
        kind="warning"
        title="You're offline"
        message="Can't reach your anchor. You'll appear offline and new messages stay on this device until the connection comes back."
      />
    </View>
  );
}
