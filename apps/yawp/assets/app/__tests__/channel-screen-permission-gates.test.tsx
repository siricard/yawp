import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {PERMISSION_BITS} from '../chat/edit-mode';
import type {ChannelMessage} from '../chat/channel-store';

const OTHER = 'zOther';

function msg(over: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: 'm-1',
    channel_id: 'chan-1',
    sender_did: OTHER,
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
let mockEffectiveBits = 0;

jest.mock('../chat/channel-store', () => ({
  useChannel: () => ({
    status: 'joined',
    errorMessage: null,
    messages: mockMessages,
    effectiveBits: mockEffectiveBits,
    send: jest.fn(),
    edit: jest.fn(),
    remove: jest.fn(),
    markRead: jest.fn(),
  }),
}));

jest.mock('../identity-context', () => ({
  useIdentityState: () => ({
    status: 'ready',
    identity: {did: 'zSelf', didFull: 'did:yawp:zSelf'},
  }),
  useDisplayName: () => ({effectiveDisplayName: 'Me'}),
}));

import {ChannelScreen} from '../screens/ChannelScreen';

const roots: ReactTestRenderer.ReactTestRenderer[] = [];

function render(effectiveBits: number) {
  mockEffectiveBits = effectiveBits;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <ChannelScreen
        serverUrl="http://localhost:4000"
        serverId="srv-1"
        serverLabel="localhost:4000"
        channelId="chan-1"
        channelName="general"
        onBack={() => {}}
      />,
    );
  });
  roots.push(root!);
  return root!;
}

function openMembers(root: ReactTestRenderer.ReactTestRenderer) {
  ReactTestRenderer.act(() => {
    root.root.findByProps({testID: 'channel-members-toggle'}).props.onPress();
  });
}

const MEMBER_BITS =
  PERMISSION_BITS.read_messages | PERMISSION_BITS.send_messages;

describe('ChannelScreen destructive affordances gated per bit', () => {
  beforeEach(() => {
    mockMessages = [msg({})];
  });

  afterEach(() => {
    while (roots.length) {
      const root = roots.pop()!;
      ReactTestRenderer.act(() => root.unmount());
    }
  });

  test('delete-others is hidden without manage_messages', () => {
    const root = render(MEMBER_BITS);
    expect(root.root.findAllByProps({testID: 'message-delete-m-1'}).length).toBe(
      0,
    );
  });

  test('delete-others is shown with manage_messages', () => {
    const root = render(MEMBER_BITS | PERMISSION_BITS.manage_messages);
    expect(
      root.root.findAllByProps({testID: 'message-delete-m-1'}).length,
    ).toBeGreaterThan(0);
  });

  test('kick is hidden without kick_members; ban hidden without ban_members', () => {
    const root = render(MEMBER_BITS);
    openMembers(root);
    expect(
      root.root.findAllByProps({testID: 'member-kick-zOther'}).length,
    ).toBe(0);
    expect(
      root.root.findAllByProps({testID: 'member-ban-zOther'}).length,
    ).toBe(0);
  });

  test('kick is shown but ban is hidden when only kick_members is held', () => {
    const root = render(MEMBER_BITS | PERMISSION_BITS.kick_members);
    openMembers(root);
    expect(
      root.root.findAllByProps({testID: 'member-kick-zOther'}).length,
    ).toBeGreaterThan(0);
    expect(
      root.root.findAllByProps({testID: 'member-ban-zOther'}).length,
    ).toBe(0);
  });

  test('ban is shown but kick hidden when only ban_members is held', () => {
    const root = render(MEMBER_BITS | PERMISSION_BITS.ban_members);
    openMembers(root);
    expect(
      root.root.findAllByProps({testID: 'member-ban-zOther'}).length,
    ).toBeGreaterThan(0);
    expect(
      root.root.findAllByProps({testID: 'member-kick-zOther'}).length,
    ).toBe(0);
  });

  test('both kick and ban shown when both bits are held', () => {
    const root = render(
      MEMBER_BITS | PERMISSION_BITS.kick_members | PERMISSION_BITS.ban_members,
    );
    openMembers(root);
    expect(
      root.root.findAllByProps({testID: 'member-kick-zOther'}).length,
    ).toBeGreaterThan(0);
    expect(
      root.root.findAllByProps({testID: 'member-ban-zOther'}).length,
    ).toBeGreaterThan(0);
  });
});
