import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};
const mockMetadata = {value: {} as Record<string, unknown>};
const mockMutate = jest.fn(async mut => {
  mockMetadata.value = mut(mockMetadata.value);
  return {version: 1, master: {sk: ''}, device: {deviceId: '', sk: '', pk: '', signature: '', issuedAt: ''}, metadata: mockMetadata.value};
});

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

jest.mock('../identity-context', () => ({
  useOptionalBundleMetadata: () => ({
    metadata: mockMetadata.value,
    ready: true,
    mutate: mockMutate,
  }),
}));

import {DmListScreen} from '../screens/DmListScreen';
import {fingerprintFromQrPayload, parseIdentityQrPayload} from '../screens/DmListScreen';
import type {DeliveryStateMap} from '../chat/dm-outbox';
import {bytesToB64Url} from '../identity/bundle';
import {didFromPubkey, fingerprintFromDid, fingerprintFromPubkey} from '../identity/did';

function indicatorText(
  root: ReactTestRenderer.ReactTestRenderer,
  id: string,
): unknown {
  return root.root.findByProps({testID: `dm-delivery-indicator-${id}`}).props
    .children;
}

describe('DmListScreen delivery-state overlay', () => {
  beforeEach(() => {
    mockMetadata.value = {};
    mockMutate.mockClear();
  });

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

  test('renders the yp: fingerprint in the peer profile sheet', () => {
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

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: `dm-open-profile-${did}`}).props.onPress();
    });

    const fingerprint = root.root.findByProps({testID: `dm-profile-fingerprint-${did}`});
    expect(fingerprint.props.children).toBe(expected);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('opens verification modal and stores the verified peer record', async () => {
    const did = didFromPubkey(new Uint8Array(32).fill(9));
    const expected = fingerprintFromDid(did);
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [{did, label: 'Bob'}],
            messages: [{id: 'm1', senderDid: did, body: 'hello', delivery: 'delivered'}],
          }}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: `dm-open-profile-${did}`}).props.onPress();
    });

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: `dm-verify-peer-${did}`}).props.onPress();
    });

    expect(root.root.findByProps({testID: 'dm-verify-fingerprint'}).props.children).toBe(expected);

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({testID: 'dm-verify-oob-match-button'}).props.onPress();
    });

    expect(mockMetadata.value.peerVerification).toEqual([
      {
        peer_did: did,
        status: 'verified',
        fingerprint_at_verification: expected,
        verified_at: expect.any(String),
      },
    ]);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('shows the key changed banner for verified peers only', () => {
    const did = didFromPubkey(new Uint8Array(32).fill(10));
    mockMetadata.value = {
      peerVerification: [
        {
          peer_did: did,
          status: 'key_changed',
          fingerprint_at_verification: 'yp:0000 · 0000 · 0000 · 0000',
          verified_at: 'now',
        },
      ],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [{did, label: 'Bob'}],
            messages: [{id: 'm1', senderDid: did, body: 'hello', delivery: 'delivered'}],
          }}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-key-changed-banner'})).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test('renders verified ticks in direct-message list rows', () => {
    const did = didFromPubkey(new Uint8Array(32).fill(11));
    mockMetadata.value = {
      peerVerification: [
        {
          peer_did: did,
          status: 'verified',
          fingerprint_at_verification: fingerprintFromDid(did),
          verified_at: 'now',
        },
      ],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversations={[
            {
              conversationId: 'conv-bob',
              participants: [{did, label: 'Bob'}],
              messages: [{id: 'm1', senderDid: did, body: 'hello', delivery: 'delivered'}],
            },
          ]}
        />,
      );
    });

    expect(root.root.findAllByProps({testID: `dm-peer-row-verified-${did}`}).length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('accepts a QR payload only when the DID derives from the scanned key', () => {
    const pk = new Uint8Array(32).fill(19);
    const did = didFromPubkey(pk);
    const payload = parseIdentityQrPayload(
      JSON.stringify({did, master_pk: bytesToB64Url(pk), nonce: 'n'}),
    );

    expect(payload).not.toBeNull();
    expect(fingerprintFromQrPayload(payload!, did)).toBe(fingerprintFromPubkey(pk));
  });

  test('rejects a QR payload with the right DID and the wrong scanned key', () => {
    const rightPk = new Uint8Array(32).fill(20);
    const wrongPk = new Uint8Array(32).fill(21);
    const did = didFromPubkey(rightPk);
    const payload = parseIdentityQrPayload(
      JSON.stringify({did, master_pk: bytesToB64Url(wrongPk), nonce: 'n'}),
    );

    expect(payload).not.toBeNull();
    expect(fingerprintFromQrPayload(payload!, did)).toBeNull();
  });
});
