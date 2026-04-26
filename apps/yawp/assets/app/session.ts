
import {rotateRefresh} from './ash_generated';
import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from './session-storage';

export type GetValidSessionTokenResult =
  | {ok: true; sessionToken: string}
  | {ok: false; reason: 'no_session' | 'rotation_failed'};

const REFRESH_LEEWAY_SECONDS = 60;

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function isFresh(session: StoredSession, now: number): boolean {
  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now + REFRESH_LEEWAY_SECONDS * 1000;
}

/**
 * Returns a usable session token for `serverUrl`. Transparently
 * rotates the stored refresh when the session is close to expiry.
 *
 * `customFetch` is exposed for tests and for parity with `bind.ts` —
 * production code on web rewrites relative `/rpc/...` URLs in the
 * wrapped fetch so the request lands on the correct anchor.
 */
export async function getValidSessionToken(args: {
  serverUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<GetValidSessionTokenResult> {
  const {serverUrl} = args;
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(serverUrl);

  const stored = await loadSession(base);
  if (!stored) return {ok: false, reason: 'no_session'};

  if (isFresh(stored, Date.now())) {
    return {ok: true, sessionToken: stored.sessionToken};
  }

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  let result;
  try {
    result = await rotateRefresh({
      input: {token: stored.refreshToken},
      metadataFields: ['sessionToken', 'refreshToken', 'expiresAt'],
      customFetch,
    });
  } catch {
    return {ok: false, reason: 'rotation_failed'};
  }

  if (result.success) {
    const meta = result.metadata as {
      sessionToken?: string;
      refreshToken?: string;
      expiresAt?: string;
    };
    if (!meta.sessionToken || !meta.refreshToken || !meta.expiresAt) {
      await clearSession(base);
      return {ok: false, reason: 'rotation_failed'};
    }
    const next: StoredSession = {
      sessionToken: meta.sessionToken,
      refreshToken: meta.refreshToken,
      expiresAt: meta.expiresAt,
    };
    await saveSession(base, next);
    return {ok: true, sessionToken: next.sessionToken};
  }

  await clearSession(base);
  return {ok: false, reason: 'rotation_failed'};
}
