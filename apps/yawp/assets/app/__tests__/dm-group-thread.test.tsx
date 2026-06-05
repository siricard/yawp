import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};
const mockMutate = jest.fn(async mut => mut({}));
let mockMetadata: {pinnedPeers?: string[]} = {pinnedPeers: ['conv-alice']};

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

jest.mock('../identity-context', () => ({
  useOptionalBundleMetadata: () => ({
    metadata: mockMetadata,
    ready: true,
    mutate: mockMutate,
  }),
}));

import {DmListScreen} from '../screens/DmListScreen';

describe('DmListScreen group thread', () => {
  beforeEach(() => {
    mockMetadata = {pinnedPeers: ['conv-alice']};
    mockMutate.mockClear();
  });
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

  test('renders per-recipient aggregate delivery state', () => {
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
              {
                id: 'm1',
                senderDid: 'did:yawp:alice',
                body: 'hello team',
                delivery: 'read',
                recipientDids: ['did:yawp:bob', 'did:yawp:carol'],
                deliveryStates: [
                  {recipientDid: 'did:yawp:bob', state: 'read'},
                  {recipientDid: 'did:yawp:carol', state: 'delivered'},
                ],
              },
            ],
          }}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-delivery-indicator-m1'}).props.children).toEqual([
      '✓✓',
      ' ',
      'delivered to 2/2, read by 1/2',
    ]);

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

  test('reply preview uses display name and grouped sender headers collapse', () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [
              {did: 'did:yawp:alice', label: 'Alice'},
              {did: 'did:yawp:bob', label: 'Bob'},
            ],
            messages: [
              {id: 'm1', senderDid: 'did:yawp:alice', body: 'hello', delivery: 'sent', createdAt: '2026-06-05T00:00:00.000Z'},
              {id: 'm2', senderDid: 'did:yawp:alice', body: 'follow-up', delivery: 'sent', createdAt: '2026-06-05T00:04:00.000Z'},
              {id: 'm3', senderDid: 'did:yawp:bob', replyToId: 'm1', body: 'replying', delivery: 'sent'},
            ],
          }}
        />,
      );
    });

    expect(root.root.findAllByProps({testID: 'dm-message-sender-m1'}).length).toBeGreaterThan(0);
    expect(root.root.findAllByProps({testID: 'dm-message-sender-m2'})).toHaveLength(0);
    const quote = root.root.findByProps({testID: 'dm-reply-quote-m3'});
    const text = root.root
      .findAllByType(require('react-native').Text)
      .map(n => n.props.children)
      .flat(Infinity)
      .join(' ');
    expect(text).toContain('Alice');
    expect(text).not.toContain('did:yawp:alice');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('same-author headers repeat after the grouping window', () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversation={{
            participants: [{did: 'did:yawp:alice', label: 'Alice'}],
            messages: [
              {id: 'm1', senderDid: 'did:yawp:alice', body: 'hello', delivery: 'sent', createdAt: '2026-06-05T00:00:00.000Z'},
              {id: 'm2', senderDid: 'did:yawp:alice', body: 'later', delivery: 'sent', createdAt: '2026-06-05T00:06:00.000Z'},
            ],
          }}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-message-sender-m1'}).props.children).toBe('Alice');
    expect(root.root.findByProps({testID: 'dm-message-sender-m2'}).props.children).toBe('Alice');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('dedicated page orders pinned conversations from metadata before recent and all sections', async () => {
    mockMetadata = {pinnedPeers: ['conv-alice', 'conv-bob']};
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          conversations={[
            {
              conversationId: 'conv-bob',
              lastActivityAt: '2026-01-01T12:00:00.000Z',
              participants: [{did: 'did:yawp:bob', label: 'Bob'}],
              messages: [],
            },
            {
              conversationId: 'conv-alice',
              lastActivityAt: '2026-01-01T13:00:00.000Z',
              participants: [{did: 'did:yawp:alice', label: 'Alice'}],
              messages: [],
            },
          ]}
        />,
      );
    });

    expect(root.root.findByProps({testID: 'dm-section-pinned'})).toBeTruthy();
    expect(root.root.findByProps({testID: 'dm-section-recent'})).toBeTruthy();
    expect(root.root.findByProps({testID: 'dm-section-all'})).toBeTruthy();
    const pinned = root.root.findByProps({testID: 'dm-section-pinned'});
    const pinnedRows = pinned.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.testID === 'dm-conversation-conv-alice' ||
        (typeof node.type === 'string' &&
          node.props.testID === 'dm-conversation-conv-bob'),
    );
    expect(pinnedRows.map(row => row.props.testID)).toEqual([
      'dm-conversation-conv-alice',
      'dm-conversation-conv-bob',
    ]);
    expect(root.root.findByProps({testID: 'dm-section-recent'}).findAllByProps({testID: 'dm-conversation-conv-bob'})).toHaveLength(0);

    ReactTestRenderer.act(() => {
      root.root.findAllByProps({testID: 'dm-pin-conv-bob'})[0].props.onPress();
    });

    ReactTestRenderer.act(() => root.unmount());
  });
});
