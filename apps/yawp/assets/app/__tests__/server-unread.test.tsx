import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

type Handler = (payload: unknown) => void;

const channels: FakeChannel[] = [];

type FakeChannel = {
  topic: string;
  params: Record<string, unknown>;
  handlers: Record<string, Handler>;
  join: jest.Mock;
  leave: jest.Mock;
  on: (event: string, cb: Handler) => FakeChannel;
  emit: (event: string, payload: unknown) => void;
};

const fakeSocket = {
  channel(topic: string, params: Record<string, unknown>): FakeChannel {
    const handlers: Record<string, Handler> = {};
    const chan: FakeChannel = {
      topic,
      params,
      handlers,
      join: jest.fn(() => chan),
      leave: jest.fn(),
      on(event: string, cb: Handler) {
        handlers[event] = cb;
        return chan;
      },
      emit(event: string, payload: unknown) {
        handlers[event]?.(payload);
      },
    };
    channels.push(chan);
    return chan;
  },
};

jest.mock('../chat/socket', () => ({
  getSocket: jest.fn(async () => ({ok: true, socket: fakeSocket})),
}));

import {useServerUnread} from '../chat/server-unread';

function Harness({
  activeChannelId,
}: {
  activeChannelId: string | null;
}) {
  const {total, unreadByChannel} = useServerUnread({
    serverUrl: 'http://localhost:4000',
    serverId: 'srv-1',
    channelIds: ['ch-1', 'ch-2'],
    activeChannelId,
  });
  return (
    <Text testID="state">{`${total}|${JSON.stringify(unreadByChannel)}`}</Text>
  );
}

function readState(root: ReactTestRenderer.ReactTestRenderer): string {
  return root.root.findByProps({testID: 'state'}).props.children;
}

async function flush() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useServerUnread', () => {
  beforeEach(() => {
    channels.length = 0;
  });

  test('joins non-active channels in watch mode and skips the active one', async () => {
    let root: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness activeChannelId="ch-1" />);
    });
    await flush();
    expect(channels).toHaveLength(1);
    expect(channels[0].topic.endsWith('ch-2')).toBe(true);
    expect(channels.every(c => c.params.mode === 'watch')).toBe(true);
    expect(channels.every(c => c.join.mock.calls.length === 1)).toBe(true);
    ReactTestRenderer.act(() => root.unmount());
  });

  test('counts new messages on a non-active channel and not the active one', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness activeChannelId="ch-1" />);
    });
    await flush();

    const ch2 = channels.find(c => c.topic.endsWith('ch-2'))!;

    await ReactTestRenderer.act(async () => {
      ch2.emit('new_message', {id: 'm-1'});
      ch2.emit('new_message', {id: 'm-2'});
    });

    expect(readState(root)).toContain('2|');
    expect(readState(root)).toContain('"ch-2":2');
    ReactTestRenderer.act(() => root.unmount());
  });

  test('switching active channel clears its unread', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness activeChannelId="ch-1" />);
    });
    await flush();

    const ch2 = channels.find(c => c.topic.endsWith('ch-2'))!;
    await ReactTestRenderer.act(async () => {
      ch2.emit('new_message', {id: 'm-1'});
    });
    expect(readState(root)).toContain('"ch-2":1');

    await ReactTestRenderer.act(async () => {
      root.update(<Harness activeChannelId="ch-2" />);
    });
    expect(readState(root)).toContain('0|');
    ReactTestRenderer.act(() => root.unmount());
  });

  test('read markers from another session clear channel unread', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness activeChannelId="ch-1" />);
    });
    await flush();

    const ch2 = channels.find(c => c.topic.endsWith('ch-2'))!;
    await ReactTestRenderer.act(async () => {
      ch2.emit('new_message', {id: 'm-1'});
    });
    expect(readState(root)).toContain('"ch-2":1');

    await ReactTestRenderer.act(async () => {
      ch2.emit('read_marker', {
        channel_id: 'ch-2',
        last_read_message_id: 'm-1',
      });
    });

    expect(readState(root)).toContain('0|');
    ReactTestRenderer.act(() => root.unmount());
  });
});
