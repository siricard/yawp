import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};
const mockMutate = jest.fn(async mut => mut({}));

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
import type {DeliveryStateMap} from '../chat/dm-outbox';
import {didFromPubkey, fingerprintFromDid} from '../identity/did';

function indicatorText(
  root: ReactTestRenderer.ReactTestRenderer,
  id: string,
): unknown {
  return root.root.findByProps({testID: `dm-delivery-indicator-${id}`}).props
    .children;
}

describe('DmListScreen delivery-state overlay', () => {
  test('applies a retained overlay to the settled-envelope bubble at render', () => {
    const deliveryStates: DeliveryStateMap = {
      'env-1': [{recipientDid: 'did:yawp:bob', state: 'delivered'}],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          deliveryStates={deliveryStates}
          conversation={{
            participants: [
              {did: 'did:yawp:alice', label: 'Alice'},
              {did: 'did:yawp:bob', label: 'Bob'},
            ],
            messages: [
              {
                id: 'env-1',
                senderDid: 'did:yawp:alice',
                body: 'hi bob',
                delivery: 'sent',
                recipientDids: ['did:yawp:bob'],
              },
            ],
          }}
        />,
      );
    });

    expect(indicatorText(root, 'env-1')).toEqual(['✓✓', ' ', 'Delivered']);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('overlay drives the group aggregate for a multi-recipient bubble', () => {
    const deliveryStates: DeliveryStateMap = {
      'env-2': [
        {recipientDid: 'did:yawp:bob', state: 'read'},
        {recipientDid: 'did:yawp:carol', state: 'delivered'},
      ],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          deliveryStates={deliveryStates}
          conversation={{
            participants: [
              {did: 'did:yawp:alice', label: 'Alice'},
              {did: 'did:yawp:bob', label: 'Bob'},
              {did: 'did:yawp:carol', label: 'Carol'},
            ],
            messages: [
              {
                id: 'env-2',
                senderDid: 'did:yawp:alice',
                body: 'hello group',
                delivery: 'sent',
                recipientDids: ['did:yawp:bob', 'did:yawp:carol'],
              },
            ],
          }}
        />,
      );
    });

    expect(indicatorText(root, 'env-2')).toEqual([
      '✓✓',
      ' ',
      'delivered to 2/2, read by 1/2',
    ]);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('a stale overlay keyed by a local id does not touch a settled bubble', () => {
    // Overlay still keyed by the optimistic local id: the rendered bubble
    // already adopted env-3, so nothing should change.
    const deliveryStates: DeliveryStateMap = {
      'local-xyz': [{recipientDid: 'did:yawp:bob', state: 'read'}],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          deliveryStates={deliveryStates}
          conversation={{
            participants: [
              {did: 'did:yawp:alice', label: 'Alice'},
              {did: 'did:yawp:bob', label: 'Bob'},
            ],
            messages: [
              {
                id: 'env-3',
                senderDid: 'did:yawp:alice',
                body: 'hi',
                delivery: 'sent',
                recipientDids: ['did:yawp:bob'],
              },
            ],
          }}
        />,
      );
    });

    expect(indicatorText(root, 'env-3')).toEqual(['✓', ' ', 'Sent']);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('renders the yp: fingerprint for a participant whose DID decodes', () => {
    const did = didFromPubkey(new Uint8Array(32).fill(7));
    const expected = fingerprintFromDid(did);
    expect(expected).not.toBeNull();
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [{did, label: 'Bob Sender'}],
            messages: [{id: 'm1', senderDid: did, body: 'hello', delivery: 'delivered'}],
          }}
        />,
      );
    });

    const fingerprint = root.root.findByProps({
      testID: `dm-participant-fingerprint-${did}`,
    });
    expect(fingerprint.props.children).toBe(expected);

    ReactTestRenderer.act(() => root.unmount());
  });
});
