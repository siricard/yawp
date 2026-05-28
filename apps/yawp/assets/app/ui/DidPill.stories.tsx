import React from 'react';
import {View} from 'react-native';

import {DidPill} from './DidPill';

export default {title: 'DidPill'};

export const Basic = () => (
  <View style={{padding: 24}}>
    <DidPill did="did:yawp:8f3a2c1b9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a" />
  </View>
);

export const Short = () => (
  <View style={{padding: 24}}>
    <DidPill did="did:yawp:abc123" />
  </View>
);
