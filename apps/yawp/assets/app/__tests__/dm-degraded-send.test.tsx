import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStatus = {value: {status: 'connected', degraded: false}};

jest.mock('../chat/anchor-connection', () => ({
  useAnchorStatus: () => mockStatus.value,
}));

import {DmListScreen} from '../screens/DmListScreen';

function render(): ReactTestRenderer.ReactTestRenderer {
  let root!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(<DmListScreen onBack={() => {}} />);
  });
  return root;
}

function type(root: ReactTestRenderer.ReactTestRenderer, text: string) {
  ReactTestRenderer.act(() => {
    root.root
      .findByProps({testID: 'dm-composer-input'})
      .props.onChangeText(text);
  });
}

function send(root: ReactTestRenderer.ReactTestRenderer) {
  ReactTestRenderer.act(() => {
    root.root.findByProps({testID: 'dm-send-button'}).props.onPress();
  });
}

function has(root: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return root.root.findAllByProps({testID}).length > 0;
}

describe('DmListScreen degraded-mode send', () => {
  afterEach(() => {
    mockStatus.value = {status: 'connected', degraded: false};
  });

  test('a send while degraded is queued with a queued-locally indicator', () => {
    mockStatus.value = {status: 'degraded', degraded: true};
    const root = render();

    expect(has(root, 'dm-degraded-notice')).toBe(true);

    type(root, 'hi there');
    send(root);

    expect(has(root, 'dm-message-dm-1')).toBe(true);
    expect(has(root, 'dm-queued-indicator-dm-1')).toBe(true);

    ReactTestRenderer.act(() => root.unmount());
  });

  test('a send while connected is delivered, not queued', () => {
    mockStatus.value = {status: 'connected', degraded: false};
    const root = render();

    expect(has(root, 'dm-degraded-notice')).toBe(false);

    type(root, 'hi there');
    send(root);

    expect(has(root, 'dm-message-dm-1')).toBe(true);
    expect(has(root, 'dm-queued-indicator-dm-1')).toBe(false);

    ReactTestRenderer.act(() => root.unmount());
  });

  // BUG A regression: the HTTP `/api/dm/submit` path (via onSendMessage /
  // onStartConversation) is independent of the always-on anchor websocket.
  // A sender whose socket is `degraded` must still attempt the submit instead
  // of silently queuing locally and never POSTing.
  test('a send while degraded still attempts the submit handler (B-anchored sender)', () => {
    mockStatus.value = {status: 'degraded', degraded: true};
    const onSendMessage = jest.fn().mockResolvedValue({
      id: 'env-1',
      conversationId: 'conv-1',
      delivery: 'sent' as const,
      senderDid: 'did:yawp:bob',
      recipientDids: ['did:yawp:alice'],
      createdAt: '2026-06-08T00:00:00.000Z',
    });

    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          onSendMessage={onSendMessage}
          conversation={{
            conversationId: 'conv-1',
            participants: [
              {did: 'did:yawp:bob', label: 'Bob'},
              {did: 'did:yawp:alice', label: 'Alice'},
            ],
            messages: [
              {
                id: 'env-0',
                body: 'earlier',
                delivery: 'sent',
                senderDid: 'did:yawp:bob',
                recipientDids: ['did:yawp:alice'],
              },
            ],
          }}
        />,
      );
    });

    type(root, 'reverse hello');
    send(root);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      ['did:yawp:alice'],
      'reverse hello',
      'conv-1',
    );

    ReactTestRenderer.act(() => root.unmount());
  });

  test('starting a conversation while degraded still calls onStartConversation', () => {
    mockStatus.value = {status: 'degraded', degraded: true};
    const onStartConversation = jest.fn();

    let root!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      root = ReactTestRenderer.create(
        <DmListScreen
          onBack={() => {}}
          availablePeers={[{did: 'did:yawp:alice', label: 'Alice'}]}
          onStartConversation={onStartConversation}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      root.root
        .findByProps({testID: 'dm-peer-toggle-did:yawp:alice'})
        .props.onPress();
    });
    type(root, 'first contact');
    send(root);

    expect(onStartConversation).toHaveBeenCalledTimes(1);
    expect(onStartConversation).toHaveBeenCalledWith(['did:yawp:alice'], 'first contact');

    ReactTestRenderer.act(() => root.unmount());
  });
});
