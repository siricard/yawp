import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};
const mockMutate = jest.fn(async mut => mut({}));
const mockAcceptRequest = jest.fn(async () => true);

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

jest.mock('../identity-context', () => ({
  useOptionalBundleMetadata: () => ({
    metadata: {},
    ready: true,
    mutate: mockMutate,
  }),
}));

import {DmListScreen} from '../screens/DmListScreen';

describe('DmListScreen message requests', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockAcceptRequest.mockClear();
  });

  test('request conversations are read-only until accepted', () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            isRequest: true,
            participants: [{did: 'did:yawp:alice', label: 'Alice'}],
            messages: [
              {id: 'm1', senderDid: 'did:yawp:alice', body: 'hello', delivery: 'delivered'},
            ],
          }}
          onAcceptRequest={mockAcceptRequest}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-message-request-card'})).toBeTruthy();
    expect(root.root.findByProps({testID: 'dm-request-read-only-notice'})).toBeTruthy();
    expect(root.root.findAllByProps({testID: 'dm-composer-input'})).toHaveLength(0);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('accepting records the sender as an accepted peer and shows the composer', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            isRequest: true,
            participants: [{did: 'did:yawp:alice', label: 'Alice'}],
            messages: [
              {id: 'm1', senderDid: 'did:yawp:alice', body: 'hello', delivery: 'delivered'},
            ],
          }}
          onAcceptRequest={mockAcceptRequest}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({testID: 'dm-accept-request-button'}).props.onPress();
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]({acceptedPeers: ['did:yawp:bob']})).toEqual({
      acceptedPeers: ['did:yawp:bob', 'did:yawp:alice'],
    });
    expect(mockAcceptRequest).toHaveBeenCalledWith('did:yawp:alice');
    expect(root.root.findAllByProps({testID: 'dm-message-request-card'})).toHaveLength(0);
    expect(root.root.findByProps({testID: 'dm-composer-input'})).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });
});
