import React from 'react';
import {Text, View} from 'react-native';

import {Button} from './Button';
import {Modal} from './Modal';

export default {title: 'Modal'};

export const Basic = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <View style={{padding: 24}}>
      <Button label="Open" onPress={() => setOpen(true)} />
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Mint invite"
        footer={
          <>
            <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
            <Button label="Mint" onPress={() => setOpen(false)} />
          </>
        }>
        <Text style={{color: '#f0efea'}}>Modal body content.</Text>
      </Modal>
    </View>
  );
};
