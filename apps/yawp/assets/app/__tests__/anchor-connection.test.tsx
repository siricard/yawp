import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

type Handler = (payload: unknown) => void;

type FakeChannel = {
  topic: string;
  handlers: Record<string, Handler>;
  join: jest.Mock;
  leave: jest.Mock;
  on: (event: string, cb: Handler) => FakeChannel;
  emit: (event: string, payload?: unknown) => void;
};

type FakeSocket = {
  url: string;
  channels: FakeChannel[];
  errorCallbacks: Handler[];
  closeCallbacks: Handler[];
  channel: (topic: string) => FakeChannel;
  onError: (cb: Handler) => number;
  onClose: (cb: Handler) => number;
  off: jest.Mock;
};

const mockSockets = new Map<string, FakeSocket>();
const mockUnreachableUrls = new Set<string>();

function makeSocket(url: string): FakeSocket {
  const socket: FakeSocket = {
    url,
    channels: [],
    errorCallbacks: [],
    closeCallbacks: [],
    channel(topic: string) {
      const handlers: Record<string, Handler> = {};
      const chan: FakeChannel = {
        topic,
        handlers,
        join: jest.fn(() => chan),
        leave: jest.fn(),
        on(event: string, cb: Handler) {
          handlers[event] = cb;
          return chan;
        },
        emit(event: string, payload?: unknown) {
          handlers[event]?.(payload);
        },
      };
      socket.channels.push(chan);
      return chan;
    },
    onError(cb: Handler) {
      socket.errorCallbacks.push(cb);
      return socket.errorCallbacks.length - 1;
    },
    onClose(cb: Handler) {
      socket.closeCallbacks.push(cb);
      return socket.closeCallbacks.length - 1;
    },
    off: jest.fn(),
  };
  return socket;
}

function mockSocketFor(url: string): FakeSocket {
  const existing = mockSockets.get(url);
  if (existing) return existing;
  const socket = makeSocket(url);
  mockSockets.set(url, socket);
  return socket;
}

jest.mock('../chat/socket', () => ({
  getSocket: jest.fn(async (url: string) =>
    mockUnreachableUrls.has(url)
      ? {ok: false, reason: 'no_session'}
      : {ok: true, socket: mockSocketFor(url)},
  ),
}));

import {useAnchorConnection} from '../chat/anchor-connection';

function Harness({urls, did}: {urls: string[]; did: string}) {
  const {status, degraded} = useAnchorConnection(urls, did);
  return <Text testID="state">{`${status}|${degraded}`}</Text>;
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

const A = 'http://localhost:4000';
const B = 'http://localhost:4100';

describe('useAnchorConnection', () => {
  beforeEach(() => {
    mockSockets.clear();
    mockUnreachableUrls.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('joins the user:<did> topic on the anchor and reports connecting first', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A]} did="abc123" />);
    });
    await flush();

    const socket = mockSocketFor(A);
    expect(socket.channels).toHaveLength(1);
    expect(socket.channels[0].topic).toBe('user:abc123');
    expect(socket.channels[0].join).toHaveBeenCalledTimes(1);
    expect(readState(root)).toBe('connecting|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('transitions to connected when the anchor pushes presence_state', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A]} did="abc123" />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).channels[0].emit('presence_state', {});
    });

    expect(readState(root)).toBe('connected|false');
    ReactTestRenderer.act(() => root.unmount());
  });

  test('surfaces degraded mode after 60s of an unreachable anchor', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A]} did="abc123" />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).channels[0].emit('presence_state', {});
    });
    expect(readState(root)).toBe('connected|false');

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).closeCallbacks.forEach(cb => cb({} as never));
    });
    expect(readState(root)).toBe('connecting|false');

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(readState(root)).toBe('degraded|true');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('does not flip to degraded if the anchor reconnects within the window', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A]} did="abc123" />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).errorCallbacks.forEach(cb => cb({} as never));
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(readState(root)).toBe('connecting|false');

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).channels[0].emit('presence_state', {});
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(readState(root)).toBe('connected|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('with no anchors stays connecting and opens no channel', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[]} did="abc123" />);
    });
    await flush();

    expect(mockSockets.size).toBe(0);
    expect(readState(root)).toBe('connecting|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('stays connected while ANY of several anchors is reachable', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A, B]} did="abc123" />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).channels[0].emit('presence_state', {});
      mockSocketFor(B).channels[0].emit('presence_state', {});
    });
    expect(readState(root)).toBe('connected|false');

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).closeCallbacks.forEach(cb => cb({} as never));
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(readState(root)).toBe('connected|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('flips to degraded only after ALL anchors fail for 60s', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness urls={[A, B]} did="abc123" />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).channels[0].emit('presence_state', {});
      mockSocketFor(B).channels[0].emit('presence_state', {});
    });
    expect(readState(root)).toBe('connected|false');

    await ReactTestRenderer.act(async () => {
      mockSocketFor(A).closeCallbacks.forEach(cb => cb({} as never));
      mockSocketFor(B).closeCallbacks.forEach(cb => cb({} as never));
    });
    expect(readState(root)).toBe('connecting|false');

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(readState(root)).toBe('degraded|true');

    ReactTestRenderer.act(() => root.unmount());
  });
});
