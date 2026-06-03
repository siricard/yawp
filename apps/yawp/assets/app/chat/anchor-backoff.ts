const BASE_MS = 1000;
const CAP_MS = 30000;

export function anchorReconnectAfterMs(tries: number): number {
  const exponent = Math.max(0, tries - 1);
  const delay = BASE_MS * 2 ** exponent;
  return Math.min(delay, CAP_MS);
}

export const DEGRADED_AFTER_MS = 60000;
