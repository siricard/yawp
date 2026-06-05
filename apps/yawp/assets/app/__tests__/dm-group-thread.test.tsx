import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

import {DmListScreen} from '../screens/DmListScreen';

describe('DmListScreen group thread', () => {
  test('shows fixed participants and attributes bubbles to senders', () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [
              {did: 'did:yawp:alice', label: 'Alice'},
              {did: 'did:yawp:bob', label: 'Bob'},
              {did: 'did:yawp:carol', label: 'Carol'},
            ],
            messages: [
              {id: 'm1', senderDid: 'did:yawp:alice', body: 'hello team', delivery: 'sent'},
              {id: 'm2', senderDid: 'did:yawp:carol', body: 'hi alice', delivery: 'sent'},
            ],
          }}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-participant-list'})).toBeTruthy();
    expect(root.root.findByProps({testID: 'dm-participant-did:yawp:bob'})).toBeTruthy();
    expect(root.root.findByProps({testID: 'dm-message-sender-m1'}).props.children).toBe('Alice');
    expect(root.root.findByProps({testID: 'dm-message-sender-m2'}).props.children).toBe('Carol');
    expect(root.root.findAllByProps({testID: 'dm-add-participant-button'})).toHaveLength(0);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('new group draft accepts more than one peer', () => {
    const submitted: string[][] = [];
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          availablePeers={[
            {did: 'did:yawp:bob', label: 'Bob'},
            {did: 'did:yawp:carol', label: 'Carol'},
            {did: 'did:yawp:dave', label: 'Dave'},
          ]}
          onStartConversation={recipientDids => submitted.push(recipientDids)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'dm-peer-toggle-did:yawp:bob'}).props.onPress();
      root.root.findByProps({testID: 'dm-peer-toggle-did:yawp:carol'}).props.onPress();
    });

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'dm-composer-input'}).props.onChangeText('hello group');
    });

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'dm-send-button'}).props.onPress();
    });

    expect(submitted).toEqual([['did:yawp:bob', 'did:yawp:carol']]);

    ReactTestRenderer.act(() => root.unmount());
  });
});
