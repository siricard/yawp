/**
 * Unit tests for the call teardown helper.
 *
 * The scenario we're guarding against: `getUserMedia` succeeded (mic
 * is live, tracks are running) but the subsequent `channel.join`
 * failed (network blip, unauthenticated socket, server rejection).
 * Without explicit teardown, the local `MediaStreamTrack`s stay in
 * `readyState === 'live'` (mic icon stays lit) and the
 * `RTCPeerConnection` is never closed.
 *
 * `cleanupCallResources` is the single function called both on
 * user-initiated hang-up and on join failure. We verify here that it
 * stops every track, closes the pc, and leaves the channel.
 */

import {cleanupCallResources} from '../call-cleanup';

type FakeTrack = {
  readyState: 'live' | 'ended';
  stop: jest.Mock<void, []>;
};

type FakeStream = {
  getTracks(): FakeTrack[];
};

type FakePc = {
  close: jest.Mock<void, []>;
};

type FakeChannel = {
  leave: jest.Mock<void, []>;
};

function makeTrack(): FakeTrack {
  const t: FakeTrack = {
    readyState: 'live',
    stop: jest.fn(() => {
      t.readyState = 'ended';
    }),
  };
  return t;
}

describe('cleanupCallResources', () => {
  test('stops every local track (readyState === ended after cleanup)', () => {
    const t1 = makeTrack();
    const t2 = makeTrack();
    const stream: FakeStream = {getTracks: () => [t1, t2]};
    const pc: FakePc = {close: jest.fn()};
    const channel: FakeChannel = {leave: jest.fn()};

    cleanupCallResources({pc, localStream: stream, channel});

    expect(t1.stop).toHaveBeenCalledTimes(1);
    expect(t2.stop).toHaveBeenCalledTimes(1);
    expect([t1.readyState, t2.readyState]).toEqual(['ended', 'ended']);
  });

  test('closes the RTCPeerConnection', () => {
    const stream: FakeStream = {getTracks: () => []};
    const pc: FakePc = {close: jest.fn()};
    const channel: FakeChannel = {leave: jest.fn()};

    cleanupCallResources({pc, localStream: stream, channel});

    expect(pc.close).toHaveBeenCalledTimes(1);
  });

  test('leaves the channel', () => {
    const stream: FakeStream = {getTracks: () => []};
    const pc: FakePc = {close: jest.fn()};
    const channel: FakeChannel = {leave: jest.fn()};

    cleanupCallResources({pc, localStream: stream, channel});

    expect(channel.leave).toHaveBeenCalledTimes(1);
  });

  test('tolerates missing pc / stream / channel (idempotent on partial state)', () => {
    expect(() =>
      cleanupCallResources({pc: null, localStream: null, channel: null}),
    ).not.toThrow();
  });

  test('isolates failures: if pc.close throws, tracks are still stopped', () => {
    const t = makeTrack();
    const stream: FakeStream = {getTracks: () => [t]};
    const pc: FakePc = {
      close: jest.fn(() => {
        throw new Error('boom');
      }),
    };
    const channel: FakeChannel = {leave: jest.fn()};

    expect(() =>
      cleanupCallResources({pc, localStream: stream, channel}),
    ).not.toThrow();
    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(t.readyState).toBe('ended');
    expect(channel.leave).toHaveBeenCalledTimes(1);
  });
});
