import React from 'react';
import {Text, View} from 'react-native';

import {Card} from './Card';

export default {title: 'Card'};

export const Default = () => (
  <View style={{padding: 24}}>
    <Card>
      <Text style={{color: '#f0efea'}}>Default surface card.</Text>
    </Card>
  </View>
);

export const Elevated = () => (
  <View style={{padding: 24}}>
    <Card variant="elevated">
      <Text style={{color: '#f0efea'}}>Elevated card.</Text>
    </Card>
  </View>
);

export const Interactive = () => (
  <View style={{padding: 24}}>
    <Card variant="interactive" onPress={() => {}}>
      <Text style={{color: '#f0efea'}}>Press me.</Text>
    </Card>
  </View>
);
