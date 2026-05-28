import React from 'react';
import {View} from 'react-native';

import {Button} from './Button';

export default {title: 'Button'};

export const Primary = () => (
  <View style={{padding: 24}}>
    <Button label="I've written it down" variant="primary" />
  </View>
);

export const Secondary = () => (
  <View style={{padding: 24}}>
    <Button label="Cancel" variant="secondary" />
  </View>
);

export const Ghost = () => (
  <View style={{padding: 24}}>
    <Button label="Not now" variant="ghost" />
  </View>
);

export const Danger = () => (
  <View style={{padding: 24}}>
    <Button label="Erase identity" variant="danger" />
  </View>
);

export const Sizes = () => (
  <View style={{padding: 24, gap: 12}}>
    <Button label="Small" size="sm" />
    <Button label="Medium" size="md" />
    <Button label="Large" size="lg" />
  </View>
);

export const Disabled = () => (
  <View style={{padding: 24}}>
    <Button label="Continue" disabled />
  </View>
);

export const Block = () => (
  <View style={{padding: 24}}>
    <Button label="Unlock" block size="lg" />
  </View>
);
