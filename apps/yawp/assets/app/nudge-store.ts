
import {useCallback, useEffect, useState} from 'react';

import type {IdentityBundleV1} from './identity/bundle';
import {
  clearIdentityBundle,
  loadStoredEntry,
  saveIdentity,
} from './identity/storage-bundle';

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

type NudgeState = {
  firstBoundAt: string | null;
  dismissed: boolean;
};

async function readNudgeState(): Promise<NudgeState> {
  const entry = await loadStoredEntry();
  if (!entry || entry.kind !== 'unsealed') {
    return {firstBoundAt: null, dismissed: false};
  }
  return {
    firstBoundAt: entry.bundle.metadata?.firstBoundAt ?? null,
    dismissed: entry.bundle.metadata?.secondAnchorNudgeDismissed ?? false,
  };
}

function withMetadata(
  bundle: IdentityBundleV1,
  patch: Partial<NonNullable<IdentityBundleV1['metadata']>>,
): IdentityBundleV1 {
  return {
    ...bundle,
    metadata: {...(bundle.metadata ?? {}), ...patch},
  };
}

/**
 * Set `metadata.firstBoundAt` to `now.toISOString()` if it is not already
 * set. No-op when no unsealed identity bundle exists (sealed bundles can't
 * be mutated without the passphrase — the nudge simply won't fire until
 * the bundle is unlocked, which is acceptable since the user must unlock
 * to bind anyway).
 */
export async function recordFirstBoundAtIfUnset(
  now: Date = new Date(),
): Promise<void> {
  const entry = await loadStoredEntry();
  if (!entry || entry.kind !== 'unsealed') return;
  if (entry.bundle.metadata?.firstBoundAt) return;
  const next = withMetadata(entry.bundle, {firstBoundAt: now.toISOString()});
  await saveIdentity(next);
}

/**
 * Persist `metadata.secondAnchorNudgeDismissed = true`. No-op when there's
 * no unsealed bundle to write to (same rationale as above).
 */
async function persistDismissal(): Promise<void> {
  const entry = await loadStoredEntry();
  if (!entry || entry.kind !== 'unsealed') return;
  if (entry.bundle.metadata?.secondAnchorNudgeDismissed) return;
  const next = withMetadata(entry.bundle, {secondAnchorNudgeDismissed: true});
  await saveIdentity(next);
}

/** Test-only reset: wipes the entire identity bundle. */
export async function __resetNudgeStoreForTests(): Promise<void> {
  await clearIdentityBundle();
}

/**
 * React hook driving the banner. Reads nudge state out of the
 * identity bundle on mount; refreshes when `serversCount` flips from
 * 0 to ≥1 so the home screen picks up the timestamp the moment
 * AddServerScreen writes it after the first bind. Dismissal is
 * persisted to the bundle.
 */
export function useSecondAnchorNudge(serversCount: number): {
  visible: boolean;
  dismiss: () => void;
} {
  const [{firstBoundAt, dismissed}, setNudgeState] = useState<NudgeState>({
    firstBoundAt: null,
    dismissed: false,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const state = await readNudgeState();
      if (!mounted) return;
      setNudgeState(state);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (serversCount >= 1 && !firstBoundAt) {
      let mounted = true;
      (async () => {
        const state = await readNudgeState();
        if (!mounted) return;
        setNudgeState(state);
      })();
      return () => {
        mounted = false;
      };
    }
    return undefined;
  }, [serversCount, firstBoundAt]);

  const dismiss = useCallback(() => {
    setNudgeState(prev => ({...prev, dismissed: true}));
    void persistDismissal();
  }, []);

  const visible =
    loaded &&
    shouldShowSecondAnchorNudge({serversCount, firstBoundAt, dismissed});

  return {visible, dismiss};
}
