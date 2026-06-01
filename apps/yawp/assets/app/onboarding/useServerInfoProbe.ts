import {useCallback, useState} from 'react';

export type ServerInfo = {
  claimed: boolean;
  serverName: string | null;
  fingerprint: string | null;
};

export type ProbeState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'ready'; info: ServerInfo}
  | {status: 'error'; message: string};

const PROBE_TIMEOUT_MS = 5000;

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Hit `<serverUrl>/.well-known/yawp/server-info` with a 5s timeout.
 * Resolves to the parsed server info, or an error describing why the
 * probe failed (unreachable / non-200 / malformed body).
 */
export async function probeServerInfo(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ok: true; info: ServerInfo} | {ok: false; message: string}> {
  const base = normalizeServerUrl(serverUrl);
  if (!base) {
    return {ok: false, message: 'Enter a server URL.'};
  }

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    : null;

  try {
    const res = await fetchImpl(`${base}/.well-known/yawp/server-info`, {
      method: 'GET',
      headers: {accept: 'application/json'},
      signal: controller?.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        message: `Couldn't reach this server (HTTP ${res.status}).`,
      };
    }

    const body = (await res.json()) as Partial<ServerInfo>;
    if (typeof body?.claimed !== 'boolean') {
      return {
        ok: false,
        message: "This server didn't return a valid response.",
      };
    }

    return {
      ok: true,
      info: {
        claimed: body.claimed,
        serverName: typeof body.serverName === 'string' ? body.serverName : null,
        fingerprint:
          typeof body.fingerprint === 'string' ? body.fingerprint : null,
      },
    };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      message: aborted
        ? "Couldn't reach this server (timed out)."
        : 'Could not reach this server. Check the URL and your connection.',
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function useServerInfoProbe(fetchImpl: typeof fetch = fetch) {
  const [state, setState] = useState<ProbeState>({status: 'idle'});

  const probe = useCallback(
    async (serverUrl: string): Promise<ProbeState> => {
      setState({status: 'loading'});
      const result = await probeServerInfo(serverUrl, fetchImpl);
      const next: ProbeState = result.ok
        ? {status: 'ready', info: result.info}
        : {status: 'error', message: result.message};
      setState(next);
      return next;
    },
    [fetchImpl],
  );

  const reset = useCallback(() => setState({status: 'idle'}), []);

  return {state, probe, reset};
}
