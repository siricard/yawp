import React from 'react';
import {Text, View} from 'react-native';

import {Section, Subsection} from './Section';

export default {title: 'Section'};

export const Basic = () => (
  <View style={{padding: 24}}>
    <Section title="Invites" subtitle="Mint codes for this server.">
      <Subsection label="active invites">
        <Text style={{color: '#f0efea'}}>(list goes here)</Text>
      </Subsection>
      <Subsection label="mint new">
        <Text style={{color: '#f0efea'}}>(form goes here)</Text>
      </Subsection>
    </Section>
  </View>
);
