import React from 'react';
import {View} from 'react-native';

import {Autocomplete} from './Autocomplete';

export default {title: 'Autocomplete'};

const WORDS = ['abandon', 'ability', 'able', 'about', 'above', 'absent'];

export const Mnemonic = () => {
  const [value, setValue] = React.useState('ab');
  const suggestions = WORDS.filter(w => w.startsWith(value.toLowerCase()));
  return (
    <View style={{padding: 24}}>
      <Autocomplete
        value={value}
        onChangeText={setValue}
        suggestions={suggestions}
        onSelect={setValue}
      />
    </View>
  );
};
