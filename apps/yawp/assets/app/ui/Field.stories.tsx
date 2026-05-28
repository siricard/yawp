import React from 'react';
import {View} from 'react-native';

import {Field} from './Field';
import {Input} from './Input';

export default {title: 'Field'};

export const WithHelper = () => {
  const [value, setValue] = React.useState('');
  return (
    <View style={{padding: 24}}>
      <Field
        label="Display name"
        helper="Visible to peers you've already verified.">
        <Input value={value} onChangeText={setValue} />
      </Field>
    </View>
  );
};

export const WithError = () => {
  const [value, setValue] = React.useState('bad');
  return (
    <View style={{padding: 24}}>
      <Field label="Passphrase" error="That passphrase didn't work.">
        <Input variant="password" value={value} onChangeText={setValue} error />
      </Field>
    </View>
  );
};
