import React from 'react';
import {View} from 'react-native';

import {Banner} from './Banner';

export default {title: 'Banner'};

export const Info = () => (
  <View style={{padding: 24}}>
    <Banner kind="info" title="Heads up" message="An informational notice." />
  </View>
);

export const Warning = () => (
  <View style={{padding: 24}}>
    <Banner
      kind="warning"
      title="Add a second anchor"
      message="So your identity survives this server going dark."
    />
  </View>
);

export const Success = () => (
  <View style={{padding: 24}}>
    <Banner kind="success" title="Verified" message="Your device is bound." />
  </View>
);

export const Danger = () => (
  <View style={{padding: 24}}>
    <Banner
      kind="danger"
      title="Key changed"
      message="The peer's identity key has changed."
    />
  </View>
);
