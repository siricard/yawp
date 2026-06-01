import {banMember, kickMember} from './ash_generated';
import {getValidSessionToken} from './session';

export type ModerationResult =
  | {ok: true}
  | {ok: false; error: string; message: string};

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

const SLUG_MESSAGES: Record<string, string> = {
  not_authenticated: 'You must be signed in on this server.',
  missing_permission: "You don't have permission to do that.",
  no_session: 'No active session on this anchor. Re-add the server.',
  rotation_failed: 'Your session expired. Re-add the server.',
  internal_error: 'The server hit an internal error. Try again later.',
  network_error: 'Could not reach the server. Check your connection.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

type ModerationArgs = {
  serverUrl: string;
  serverId: string;
  /** Either identityId or did must be provided to target the member. */
  identityId?: string | null;
  did?: string | null;
  reason?: string | null;
  fetchImpl?: typeof fetch;
};

async function runModeration(
  kind: 'kick' | 'ban',
  args: ModerationArgs,
): Promise<ModerationResult> {
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(args.serverUrl);

  const session = await getValidSessionToken({
    serverUrl: base,
    fetchImpl: baseFetch,
  });
  if (!session.ok) {
    return {ok: false, error: session.reason, message: humanize(session.reason, 'No session.')};
  }

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  const input = {
    serverId: args.serverId,
    identityId: args.identityId ?? null,
    did: args.did ?? null,
    reason: args.reason ?? null,
  };

  const config = {
    input,
    fields: ['id'] as ['id'],
    headers: {Authorization: `Bearer ${session.sessionToken}`},
    customFetch,
  };

  let result;
  try {
    result = kind === 'kick' ? await kickMember(config) : await banMember(config);
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      message: `${SLUG_MESSAGES.network_error} (${(e as Error)?.message ?? e})`,
    };
  }

  if (result.success) {
    return {ok: true};
  }

  const first = result.errors[0];
  const slug = first?.type ?? 'internal_error';
  return {ok: false, error: slug, message: humanize(slug, first?.message ?? 'Server error.')};
}

export function kickServerMember(args: ModerationArgs): Promise<ModerationResult> {
  return runModeration('kick', args);
}

export function banServerMember(args: ModerationArgs): Promise<ModerationResult> {
  return runModeration('ban', args);
}
