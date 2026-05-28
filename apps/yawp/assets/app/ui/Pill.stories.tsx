import React from 'react';
import {View} from 'react-native';

import {Pill} from './Pill';

export default {title: 'Pill'};

export const Tones = () => (
  <View style={{padding: 24, flexDirection: 'row', gap: 8}}>
    <Pill label="channel" />
    <Pill label="owner" tone="primary" />
    <Pill label="verified" tone="verified" />
    <Pill label="offline" tone="warning" />
    <Pill label="error" tone="danger" />
  </View>
);
