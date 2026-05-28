import React from 'react';
import {View} from 'react-native';

import {Avatar} from './Avatar';

export default {title: 'Avatar'};

export const Sizes = () => (
  <View style={{padding: 24, flexDirection: 'row', gap: 12, alignItems: 'center'}}>
    <Avatar did="did:yawp:abc" displayName="Nova Hawk" size="sm" />
    <Avatar did="did:yawp:abc" displayName="Nova Hawk" size="md" />
    <Avatar did="did:yawp:abc" displayName="Nova Hawk" size="lg" />
    <Avatar did="did:yawp:abc" displayName="Nova Hawk" size="xl" />
  </View>
);

export const Variants = () => (
  <View style={{padding: 24, flexDirection: 'row', gap: 8}}>
    {['did:yawp:a', 'did:yawp:b', 'did:yawp:c', 'did:yawp:d', 'did:yawp:e'].map(d => (
      <Avatar key={d} did={d} displayName="X Y" size="md" />
    ))}
  </View>
);
