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

const mockChannels: FakeChannel[] = [];
const mockSocketCallbacks: {error: Handler[]; close: Handler[]} = {
  error: [],
  close: [],
};

const mockFakeSocket = {
  channel(topic: string): FakeChannel {
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
    mockChannels.push(chan);
    return chan;
  },
  onError(cb: Handler): number {
    mockSocketCallbacks.error.push(cb);
    return mockSocketCallbacks.error.length - 1;
  },
  onClose(cb: Handler): number {
    mockSocketCallbacks.close.push(cb);
    return mockSocketCallbacks.close.length - 1;
  },
  off: jest.fn(),
};

const mockGetSocketResult: {ok: boolean} = {ok: true};

jest.mock('../chat/socket', () => ({
  getSocket: jest.fn(async () =>
    mockGetSocketResult.ok
      ? {ok: true, socket: mockFakeSocket}
      : {ok: false, reason: 'no_session'},
  ),
}));

import {useAnchorConnection} from '../chat/anchor-connection';

function Harness({url, did}: {url: string | null; did: string}) {
  const {status, degraded} = useAnchorConnection(url, did);
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

describe('useAnchorConnection', () => {
  beforeEach(() => {
    mockChannels.length = 0;
    mockSocketCallbacks.error.length = 0;
    mockSocketCallbacks.close.length = 0;
    mockGetSocketResult.ok = true;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('joins the user:<did> topic on the primary anchor and reports connecting first', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <Harness url="http://localhost:4000" did="abc123" />,
      );
    });
    await flush();

    expect(mockChannels).toHaveLength(1);
    expect(mockChannels[0].topic).toBe('user:abc123');
    expect(mockChannels[0].join).toHaveBeenCalledTimes(1);
    expect(readState(root)).toBe('connecting|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('transitions to connected when the anchor pushes presence_state', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <Harness url="http://localhost:4000" did="abc123" />,
      );
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockChannels[0].emit('presence_state', {});
    });

    expect(readState(root)).toBe('connected|false');
    ReactTestRenderer.act(() => root.unmount());
  });

  test('surfaces degraded mode after 60s of an unreachable anchor', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <Harness url="http://localhost:4000" did="abc123" />,
      );
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockChannels[0].emit('presence_state', {});
    });
    expect(readState(root)).toBe('connected|false');

    await ReactTestRenderer.act(async () => {
      mockSocketCallbacks.close.forEach(cb => cb({} as never));
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
      root = ReactTestRenderer.create(
        <Harness url="http://localhost:4000" did="abc123" />,
      );
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      mockSocketCallbacks.error.forEach(cb => cb({} as never));
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(readState(root)).toBe('connecting|false');

    await ReactTestRenderer.act(async () => {
      mockChannels[0].emit('presence_state', {});
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(readState(root)).toBe('connected|false');

    ReactTestRenderer.act(() => root.unmount());
  });

  test('with no primary anchor stays connecting and opens no channel', async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<Harness url={null} did="abc123" />);
    });
    await flush();

    expect(mockChannels).toHaveLength(0);
    expect(readState(root)).toBe('connecting|false');

    ReactTestRenderer.act(() => root.unmount());
  });
});
