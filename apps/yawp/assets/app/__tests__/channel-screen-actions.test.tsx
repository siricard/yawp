import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {ChannelMessage} from '../chat/channel-store';

const mockSend = jest.fn();
const mockEdit = jest.fn();
const mockRemove = jest.fn();

const SELF = 'zSelf';

function msg(over: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: 'm-1',
    channel_id: 'chan-1',
    sender_did: SELF,
    body: 'hello',
    reply_to_message_id: null,
    mentions: [],
    attachments: [],
    signed_by: 'dev',
    signature: 'sig',
    server_serial: 1,
    server_inserted_at: '2026-01-01T12:00:00.000Z',
    ...over,
  };
}

let mockMessages: ChannelMessage[] = [];

jest.mock('../chat/channel-store', () => ({
  useChannel: () => ({
    status: 'joined',
    errorMessage: null,
    messages: mockMessages,
    send: mockSend,
    edit: mockEdit,
    remove: mockRemove,
  }),
}));

jest.mock('../identity-context', () => ({
  useIdentityState: () => ({
    status: 'ready',
    identity: {did: 'zSelf', didFull: 'did:yawp:zSelf'},
  }),
  useDisplayName: () => ({effectiveDisplayName: 'Me'}),
}));

import {PERMISSION_BITS} from '../chat/edit-mode';
import {ChannelScreen} from '../screens/ChannelScreen';

const roots: ReactTestRenderer.ReactTestRenderer[] = [];

function render(effectiveBits = 0) {
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <ChannelScreen
        serverUrl="http://localhost:4000"
        serverId="srv-1"
        serverLabel="localhost:4000"
        channelId="chan-1"
        channelName="general"
        effectiveBits={effectiveBits}
        onBack={() => {}}
      />,
    );
  });
  roots.push(root!);
  return root!;
}

describe('ChannelScreen message actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [msg({})];
  });

  afterEach(() => {
    while (roots.length) {
      const root = roots.pop()!;
      ReactTestRenderer.act(() => root.unmount());
    }
  });

  test('reply opens a reply card and sending threads the reply_to id', () => {
    const root = render();
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'message-reply-m-1'}).props.onPress();
    });
    expect(
      root.root.findAllByProps({testID: 'reply-card'}).length,
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root.root
        .findByProps({testID: 'channel-message-input'})
        .props.onChangeText('a reply');
    });
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'channel-message-send'}).props.onPress();
    });
    expect(mockSend).toHaveBeenCalledWith('a reply', 'm-1');
  });

  test('editing own message in place invokes edit', () => {
    const root = render();
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'message-edit-m-1'}).props.onPress();
    });
    ReactTestRenderer.act(() => {
      root.root
        .findByProps({testID: 'channel-message-edit-input-m-1'})
        .props.onChangeText('edited');
    });
    ReactTestRenderer.act(() => {
      root.root
        .findByProps({testID: 'channel-message-edit-save-m-1'})
        .props.onPress();
    });
    expect(mockEdit).toHaveBeenCalledWith('m-1', 'edited');
  });

  test('delete requires confirmation before invoking remove', () => {
    const root = render();
    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'message-delete-m-1'}).props.onPress();
    });
    expect(mockRemove).not.toHaveBeenCalled();
    expect(
      root.root.findAllByProps({testID: 'delete-confirm'}).length,
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root.root.findByProps({testID: 'delete-confirm-delete'}).props.onPress();
    });
    expect(mockRemove).toHaveBeenCalledWith('m-1');
  });

  test('a non-self message hides edit but a manage_messages holder can delete', () => {
    mockMessages = [msg({id: 'm-2', sender_did: 'zOther'})];
    const root = render(PERMISSION_BITS.manage_messages);
    expect(
      root.root.findAllByProps({testID: 'message-edit-m-2'}).length,
    ).toBe(0);
    expect(
      root.root.findAllByProps({testID: 'message-delete-m-2'}).length,
    ).toBeGreaterThan(0);
  });

  test('a member without manage_messages cannot delete others messages', () => {
    mockMessages = [msg({id: 'm-3', sender_did: 'zOther'})];
    const root = render(PERMISSION_BITS.read_messages | PERMISSION_BITS.send_messages);
    expect(
      root.root.findAllByProps({testID: 'message-delete-m-3'}).length,
    ).toBe(0);
  });

  test('a reply renders a quote card above the message', () => {
    mockMessages = [
      msg({id: 'parent', body: 'original', server_serial: 1}),
      msg({id: 'child', reply_to_message_id: 'parent', server_serial: 2}),
    ];
    const root = render();
    expect(
      root.root.findAllByProps({testID: 'reply-quote-child'}).length,
    ).toBeGreaterThan(0);
  });
});
