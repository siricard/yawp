import React from 'react';
import {View} from 'react-native';

import {Badge} from './Badge';

export default {title: 'Badge'};

export const Tones = () => (
  <View style={{padding: 24, flexDirection: 'row', gap: 12}}>
    <Badge count={4} tone="primary" />
    <Badge count={12} tone="muted" />
    <Badge count={1} tone="danger" />
    <Badge count={9} tone="success" />
  </View>
);
