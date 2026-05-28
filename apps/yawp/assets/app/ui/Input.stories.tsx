import React from 'react';
import {View} from 'react-native';

import {Input} from './Input';

export default {title: 'Input'};

export const Text = () => {
  const [value, setValue] = React.useState('');
  return (
    <View style={{padding: 24}}>
      <Input value={value} onChangeText={setValue} placeholder="Type here" />
    </View>
  );
};

export const Password = () => {
  const [value, setValue] = React.useState('');
  return (
    <View style={{padding: 24}}>
      <Input
        variant="password"
        value={value}
        onChangeText={setValue}
        placeholder="Passphrase"
      />
    </View>
  );
};

export const Textarea = () => {
  const [value, setValue] = React.useState('');
  return (
    <View style={{padding: 24}}>
      <Input
        variant="textarea"
        value={value}
        onChangeText={setValue}
        placeholder="Notes"
      />
    </View>
  );
};

export const Error = () => (
  <View style={{padding: 24}}>
    <Input value="bad" onChangeText={() => {}} error />
  </View>
);
