import {addAnchor} from './ash_generated';
import {canonicalJson} from './canonical-json';
import {getValidSessionToken} from './session';
import type {Identity} from './identity-context';

export type AnchorProfile = {
  profileVersion: number;
  anchors: string[];
  displayName?: string | null;
  avatarRef?: string | null;
  bio?: string | null;
};

export type AddAnchorSuccess = {
  ok: true;
  anchorList: string[];
  profileVersion: number;
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
  invalid_ppe: 'Could not update your profile for the new anchor. Try again.',
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildSignedPpe(args: {
  identity: Identity;
  did: string;
  profile: AnchorProfile;
  newAnchor: string;
}): Record<string, unknown> {
  const {identity, did, profile, newAnchor} = args;
  const anchors = profile.anchors.includes(newAnchor)
    ? profile.anchors
    : [...profile.anchors, newAnchor];

  const ppe: Record<string, unknown> = {
    did,
    public_key: bytesToBase64Url(identity.masterPk),
    profile_version: profile.profileVersion + 1,
    anchors,
  };
  if (profile.displayName) ppe.display_name = profile.displayName;
  if (profile.avatarRef) ppe.avatar_ref = profile.avatarRef;
  if (profile.bio) ppe.bio = profile.bio;

  const canonical = new TextEncoder().encode(canonicalJson(ppe));
  ppe.signature = bytesToBase64Url(identity.sign(canonical));
  return ppe;
}

export async function submitAddAnchor(args: {
  primaryAnchorUrl: string;
  newAnchorHost: string;
  identity: Identity;
  profile: AnchorProfile;
  fetchImpl?: typeof fetch;
}): Promise<AddAnchorResult> {
  const {identity, profile} = args;
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

  const did = identity.didFull;
  const signedPpe = buildSignedPpe({identity, did, profile, newAnchor});

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  let result;
  try {
    result = await addAnchor({
      identity: {did},
      input: {newAnchor, signedPpe},
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
    const data = result.data as {
      anchorList?: string[];
      profileVersion?: number;
    };
    return {
      ok: true,
      anchorList: data.anchorList ?? [newAnchor],
      profileVersion: data.profileVersion ?? profile.profileVersion + 1,
    };
  }

  const first = result.errors[0];
  const slug = first?.type ?? 'internal_error';
  return {
    ok: false,
    error: slug,
    message: humanize(slug, first?.message ?? 'Server returned an error.'),
  };
}
