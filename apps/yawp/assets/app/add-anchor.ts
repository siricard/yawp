import {addAnchor} from './ash_generated';
import {getValidSessionToken} from './session';
import type {Identity} from './identity-context';

export type AddAnchorSuccess = {
  ok: true;
  anchorList: string[];
};

export type AddAnchorFailure = {
  ok: false;
  error: string;
  message: string;
};

export type AddAnchorResult = AddAnchorSuccess | AddAnchorFailure;

const SLUG_MESSAGES: Record<string, string> = {
  unauthorized: 'You can only add an anchor to your own identity.',
  invalid_anchor: 'That does not look like a valid anchor host.',
  no_session: 'No active session on your primary anchor. Re-add it first.',
  rotation_failed: 'Your session expired. Re-add your primary anchor.',
  internal_error: 'The server hit an internal error. Try again later.',
  network_error: 'Could not reach your anchor. Check the URL and your connection.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * Register `newAnchorHost` as a second anchor for the current
 * identity. The request is sent to the user's `primaryAnchorUrl`
 * (where they hold a session); that anchor appends the host to the
 * signed anchor list, bumps `profile_version`, and kicks off the
 * adoption handshake that replicates the user's data to the new
 * anchor.
 */
export async function submitAddAnchor(args: {
  primaryAnchorUrl: string;
  newAnchorHost: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<AddAnchorResult> {
  const {identity} = args;
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(args.primaryAnchorUrl);
  const newAnchor = normalizeHost(args.newAnchorHost);

  if (newAnchor === '') {
    return {
      ok: false,
      error: 'invalid_anchor',
      message: SLUG_MESSAGES.invalid_anchor,
    };
  }

  const session = await getValidSessionToken({serverUrl: base, fetchImpl: baseFetch});
  if (!session.ok) {
    return {
      ok: false,
      error: session.reason,
      message: humanize(session.reason, 'No session on your primary anchor.'),
    };
  }

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  let result;
  try {
    result = await addAnchor({
      identity: {did: identity.didFull},
      input: {newAnchor},
      fields: ['id', 'did', 'anchorList', 'profileVersion'],
      headers: {Authorization: `Bearer ${session.sessionToken}`},
      customFetch,
    });
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      message: `${SLUG_MESSAGES.network_error} (${(e as Error)?.message ?? e})`,
    };
  }

  if (result.success) {
    const data = result.data as {anchorList?: string[]};
    return {ok: true, anchorList: data.anchorList ?? [newAnchor]};
  }

  const first = result.errors[0];
  const slug = first?.type ?? 'internal_error';
  return {
    ok: false,
    error: slug,
    message: humanize(slug, first?.message ?? 'Server returned an error.'),
  };
}
