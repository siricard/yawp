
export type IceCandidateInit = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type IcePcShim = {
  remoteDescription: unknown;
  addIceCandidate(candidate: IceCandidateInit): Promise<void>;
};

/**
 * Apply an incoming candidate immediately if `pc.remoteDescription` is
 * already set; otherwise push it onto `queue` for later draining.
 *
 * Swallows `addIceCandidate` rejections — a single bad candidate is
 * not a fatal call error ; ICE will keep trying others.
 */
export async function enqueueOrApplyIce(
  pc: IcePcShim,
  candidate: IceCandidateInit,
  queue: IceCandidateInit[],
): Promise<void> {
  if (pc.remoteDescription === null || pc.remoteDescription === undefined) {
    queue.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(candidate);
  } catch {
      }
}

/**
 * Drain every queued candidate into `pc.addIceCandidate` in arrival
 * order. Must be called immediately after `setRemoteDescription`
 * succeeds (both on caller-side after `answer`, and on callee-side
 * after `offer`). The queue is mutated in-place — length 0 on return.
 */
export async function drainIceQueue(
  pc: IcePcShim,
  queue: IceCandidateInit[],
): Promise<void> {
  for (const c of queue) {
    try {
      await pc.addIceCandidate(c);
    } catch {
          }
  }
  queue.length = 0;
}
