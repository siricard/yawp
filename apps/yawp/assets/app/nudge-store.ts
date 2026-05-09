
import {useCallback, useEffect, useState} from 'react';
import {Platform} from 'react-native';

const FIRST_BOUND_AT_KEY = 'yawp.nudge.first_bound_at';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

let nativeFirstBoundAt: string | null = null;

export function loadFirstBoundAt(): string | null {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return window.localStorage.getItem(FIRST_BOUND_AT_KEY);
    } catch {
      return null;
    }
  }
  return nativeFirstBoundAt;
}

export function recordFirstBoundAtIfUnset(now: Date = new Date()): void {
  const existing = loadFirstBoundAt();
  if (existing) return;
  const iso = now.toISOString();
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(FIRST_BOUND_AT_KEY, iso);
    } catch {
    }
    return;
  }
  nativeFirstBoundAt = iso;
}

/** Test-only reset. Not exported via index. */
export function __resetNudgeStoreForTests(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(FIRST_BOUND_AT_KEY);
    } catch {
    }
  }
  nativeFirstBoundAt = null;
}

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
 * React hook driving the banner. Reads `firstBoundAt` from storage
 * on mount and recomputes visibility on every render (so it reacts to
 * `serversCount` flipping to >1 the moment the user adds a second
 * anchor). Dismissal is in-memory only.
 */
export function useSecondAnchorNudge(serversCount: number): {
  visible: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState(false);
  const [firstBoundAt, setFirstBoundAt] = useState<string | null>(() =>
    loadFirstBoundAt(),
  );

  useEffect(() => {
    if (serversCount >= 1 && !firstBoundAt) {
      setFirstBoundAt(loadFirstBoundAt());
    }
  }, [serversCount, firstBoundAt]);

  const dismiss = useCallback(() => setDismissed(true), []);

  const visible = shouldShowSecondAnchorNudge({
    serversCount,
    firstBoundAt,
    dismissed,
  });

  return {visible, dismiss};
}
