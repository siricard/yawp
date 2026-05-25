
import {useCallback, useEffect, useState} from 'react';

import {useBundleMetadata} from './identity-context';
import {clearIdentityBundle} from './identity/storage-bundle';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pure gate: given a snapshot of the relevant state, decide whether the
 * banner should render. The banner is suppressed when:
 *   - it has already been dismissed,
 *   - the user has 0 or 2+ bound servers (only one == one anchor case),
 *   - the first bind has never happened, or
 *   - fewer than 7 days have elapsed since the first bind.
 */
export function shouldShowSecondAnchorNudge(opts: {
  serversCount: number;
  firstBoundAt: string | null;
  dismissed: boolean;
  now?: Date;
}): boolean {
  if (opts.dismissed) return false;
  if (opts.serversCount !== 1) return false;
  if (!opts.firstBoundAt) return false;
  const boundAtMs = Date.parse(opts.firstBoundAt);
  if (Number.isNaN(boundAtMs)) return false;
  const nowMs = (opts.now ?? new Date()).getTime();
  return nowMs - boundAtMs >= SEVEN_DAYS_MS;
}

/**
 * hook returning a `recordFirstBound` function that writes
 * `metadata.firstBoundAt = now.toISOString` if not already set. Goes
 * through `mutateBundleMetadata`, so sealed identities are re-sealed
 * under the cached key and unsealed identities get a raw bundle write.
 *
 * The hook also returns the live `firstBoundAt` value out of the
 * in-memory bundle metadata, which the dismiss path needs for
 * `shouldShowSecondAnchorNudge`.
 */
export function useRecordFirstBoundAt(): {
  firstBoundAt: string | null;
  ready: boolean;
  recordFirstBound: (now?: Date) => Promise<void>;
} {
  const {metadata, ready, mutate} = useBundleMetadata();
  const firstBoundAt = metadata.firstBoundAt ?? null;
  const recordFirstBound = useCallback(
    async (now: Date = new Date()): Promise<void> => {
      if (!ready) return;
      await mutate(prev => {
        if (prev.firstBoundAt) return prev;
        return {...prev, firstBoundAt: now.toISOString()};
      });
    },
    [mutate, ready],
  );
  return {firstBoundAt, ready, recordFirstBound};
}

/** Test-only reset: wipes the entire identity bundle. */
export async function __resetNudgeStoreForTests(): Promise<void> {
  await clearIdentityBundle();
}

/**
 * React hook driving the banner. Reads nudge state out of the
 * in-memory identity bundle metadata via the context (no disk read).
 * Dismissal is persisted through `mutateBundleMetadata`, which handles
 * the sealed re-seal path transparently.
 */
export function useSecondAnchorNudge(serversCount: number): {
  visible: boolean;
  dismiss: () => void;
} {
  const {metadata, ready, mutate} = useBundleMetadata();
  const firstBoundAt = metadata.firstBoundAt ?? null;
  const dismissed = metadata.secondAnchorNudgeDismissed ?? false;

  const [optimisticDismissed, setOptimisticDismissed] = useState(false);
  useEffect(() => {
    if (!dismissed) setOptimisticDismissed(false);
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setOptimisticDismissed(true);
    void mutate(prev => ({...prev, secondAnchorNudgeDismissed: true}));
  }, [mutate]);

  const visible =
    ready &&
    shouldShowSecondAnchorNudge({
      serversCount,
      firstBoundAt,
      dismissed: dismissed || optimisticDismissed,
    });

  return {visible, dismiss};
}
