import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {ChannelMessage} from '../chat/channel-store';

const SELF = 'zSelf';

function msg(over: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: 'm-1',
    channel_id: 'chan-1',
    sender_did: 'zAliceFromAnchorA000000000000000000',
    body: 'hello from a guest',
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
    effectiveBits: 0,
    send: jest.fn(),
    edit: jest.fn(),
    remove: jest.fn(),
    markRead: jest.fn(),
  }),
}));

jest.mock('../identity-context', () => ({
  useIdentityState: () => ({
    status: 'ready',
    identity: {did: SELF, didFull: `did:yawp:${SELF}`},
  }),
  useDisplayName: () => ({effectiveDisplayName: 'Me'}),
}));

import {authorLabel, ChannelScreen, displayAuthor} from '../screens/ChannelScreen';

const roots: ReactTestRenderer.ReactTestRenderer[] = [];

function render() {
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

describe('authorLabel', () => {
  test('prefers the federated PPE display name when present', () => {
    expect(
      authorLabel({sender_did: 'zAlice', sender_display_name: 'Alice'}),
    ).toBe('Alice');
  });

  test('falls back to the truncated DID when no display name is set', () => {
    const did = 'zAliceFromAnchorA000000000000000000';
    expect(authorLabel({sender_did: did, sender_display_name: null})).toBe(
      displayAuthor(did),
    );
    expect(authorLabel({sender_did: did})).toBe(displayAuthor(did));
  });

  test('treats a blank display name as absent', () => {
    const did = 'zAliceFromAnchorA000000000000000000';
    expect(authorLabel({sender_did: did, sender_display_name: '   '})).toBe(
      displayAuthor(did),
    );
  });
});

describe('ChannelScreen federated display name', () => {
  afterEach(() => {
    while (roots.length) {
      const root = roots.pop()!;
      ReactTestRenderer.act(() => root.unmount());
    }
  });

  function rowText(
    root: ReactTestRenderer.ReactTestRenderer,
    messageId: string,
  ): string {
    const row = root.root.findByProps({testID: `channel-message-${messageId}`});
    const texts = row.findAllByType('Text' as never);
    return texts
      .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
      .join(' ');
  }

  test('renders a guest sender by their canonical PPE display name', () => {
    const did = 'zAliceFromAnchorA000000000000000000';
    mockMessages = [msg({sender_did: did, sender_display_name: 'Alice'})];
    const root = render();
    const text = rowText(root, 'm-1');
    expect(text).toContain('Alice');
    expect(text).not.toContain(displayAuthor(did));
  });

  test('falls back to the truncated DID when the PPE name is missing', () => {
    const did = 'zAliceFromAnchorA000000000000000000';
    mockMessages = [msg({sender_did: did, sender_display_name: null})];
    const root = render();
    const text = rowText(root, 'm-1');
    expect(text).toContain(displayAuthor(did));
  });
});
