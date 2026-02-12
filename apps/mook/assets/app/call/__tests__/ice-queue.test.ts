/**
 * Unit tests for the ICE-candidate queueing helpers.
 *
 * Real-world WebRTC signaling can deliver remote ICE candidates over
 * the channel BEFORE the local `RTCPeerConnection` has been given the
 * matching remote description. `pc.addIceCandidate(...)` rejects in
 * that state. We model the desired behaviour against a small fake `pc`
 * shim:
 *
 * - if `remoteDescription` is null: push onto the queue, do NOT call
 * `addIceCandidate`.
 * - if `remoteDescription` is set: call `addIceCandidate` immediately.
 * - after the consumer sets `remoteDescription` and calls
 * `drainIceQueue`, every queued candidate is flushed to
 * `addIceCandidate` in order and the queue is emptied.
 */

import {drainIceQueue, enqueueOrApplyIce, type IceCandidateInit} from '../ice-queue';

type FakePc = {
  remoteDescription: unknown;
  addIceCandidate: jest.Mock<Promise<void>, [IceCandidateInit]>;
};

function makeFakePc(): FakePc {
  return {
    remoteDescription: null,
    addIceCandidate: jest.fn(async (_c: IceCandidateInit) => {
      return undefined;
    }) as FakePc['addIceCandidate'],
  };
}

describe('ice-queue', () => {
  test('queues candidates while remoteDescription is null', async () => {
    const pc = makeFakePc();
    const queue: IceCandidateInit[] = [];
    const c1 = {candidate: 'candidate:1 1 udp 1 1.1.1.1 1 typ host'};
    const c2 = {candidate: 'candidate:2 1 udp 1 2.2.2.2 2 typ host'};

    await enqueueOrApplyIce(pc, c1, queue);
    await enqueueOrApplyIce(pc, c2, queue);

    expect(pc.addIceCandidate).not.toHaveBeenCalled();
    expect(queue).toEqual([c1, c2]);
  });

  test('applies candidates immediately when remoteDescription is set', async () => {
    const pc = makeFakePc();
    pc.remoteDescription = {type: 'offer', sdp: 'fake'};
    const queue: IceCandidateInit[] = [];
    const c1 = {candidate: 'candidate:1 1 udp 1 1.1.1.1 1 typ host'};

    await enqueueOrApplyIce(pc, c1, queue);

    expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(pc.addIceCandidate).toHaveBeenCalledWith(c1);
    expect(queue).toEqual([]);
  });

  test('drainIceQueue flushes queued candidates in order and empties the queue', async () => {
    const pc = makeFakePc();
    const queue: IceCandidateInit[] = [];
    const c1 = {candidate: 'candidate:1 1 udp 1 1.1.1.1 1 typ host'};
    const c2 = {candidate: 'candidate:2 1 udp 1 2.2.2.2 2 typ host'};

    await enqueueOrApplyIce(pc, c1, queue);
    await enqueueOrApplyIce(pc, c2, queue);
    expect(pc.addIceCandidate).not.toHaveBeenCalled();
    expect(queue).toHaveLength(2);

    pc.remoteDescription = {type: 'offer', sdp: 'fake'};
    await drainIceQueue(pc, queue);

    expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(pc.addIceCandidate.mock.calls[0][0]).toBe(c1);
    expect(pc.addIceCandidate.mock.calls[1][0]).toBe(c2);
    expect(queue).toHaveLength(0);
  });

  test('post-drain candidates are applied immediately (no double-queue)', async () => {
    const pc = makeFakePc();
    const queue: IceCandidateInit[] = [];
    const c1 = {candidate: 'candidate:1 1 udp 1 1.1.1.1 1 typ host'};
    const c2 = {candidate: 'candidate:2 1 udp 1 2.2.2.2 2 typ host'};

    await enqueueOrApplyIce(pc, c1, queue);
    pc.remoteDescription = {type: 'offer', sdp: 'fake'};
    await drainIceQueue(pc, queue);

    await enqueueOrApplyIce(pc, c2, queue);

    expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(queue).toHaveLength(0);
  });
});
