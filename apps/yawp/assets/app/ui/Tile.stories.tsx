import React from 'react';
import {View} from 'react-native';

import {Tile} from './Tile';

export default {title: 'Tile'};

export const States = () => (
  <View style={{padding: 24, flexDirection: 'row', gap: 8}}>
    <Tile label="Yawp Beta" />
    <Tile label="Friends" active />
    <Tile label="Kata" unread />
    <Tile label="Ops" mention />
    <Tile label="add" add />
  </View>
);
