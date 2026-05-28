import React from 'react';
import {View} from 'react-native';

import {Spinner} from './Spinner';

export default {title: 'Spinner'};

export const Small = () => (
  <View style={{padding: 24}}>
    <Spinner size="small" />
  </View>
);

export const Large = () => (
  <View style={{padding: 24}}>
    <Spinner size="large" />
  </View>
);
