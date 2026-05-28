import React from 'react';
import {View} from 'react-native';

import {Toast} from './Toast';

export default {title: 'Toast'};

export const Info = () => (
  <View style={{padding: 24}}>
    <Toast message="Saved." />
  </View>
);

export const Success = () => (
  <View style={{padding: 24}}>
    <Toast message="Identity created." kind="success" />
  </View>
);

export const Danger = () => (
  <View style={{padding: 24}}>
    <Toast message="Network error." kind="danger" />
  </View>
);
