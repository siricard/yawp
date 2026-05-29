import '../global.css';

import React from 'react';
import {View} from 'react-native';

import type {GlobalProvider} from '@ladle/react';

import {tokens} from '../../app/ui/tokens';

export const Provider: GlobalProvider = ({children}) => (
  <View
    style={{
      backgroundColor: tokens.color.bg,
      minHeight: '100vh' as unknown as number,
      padding: 24,
    }}>
    {children}
  </View>
);
