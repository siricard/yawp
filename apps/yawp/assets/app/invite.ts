
import {canonicalJson} from './canonical-json';
import {bytesToBase64Url} from './claim';
import {redeemServerInvite} from './ash_generated';
import type {Identity} from './identity-context';

export type RedeemInviteSuccess = {
  ok: true;
  serverId: string;
  role: string;
};

export type RedeemInviteFailure = {
  ok: false;
  status: number;
  /** Slug from the RPC envelope, or `network_error` for transport failures. */
  error: string;
  /** Human-readable rendition for inline display. */
  message: string;
};

export type RedeemInviteResult = RedeemInviteSuccess | RedeemInviteFailure;

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

const SLUG_MESSAGES: Record<string, string> = {
  invalid_payload: 'The server rejected the invite payload.',
  invalid_signature: 'The server rejected the request signature.',
  did_mismatch: 'The DID did not match the public key.',
  invite_token_invalid: 'That invite token is not recognized by the server.',
  invite_token_consumed: 'This invite token has already been used.',
  invite_token_exhausted: 'This invite token has no uses remaining.',
  invite_token_expired: 'This invite token has expired.',
  invite_token_revoked: 'This invite token has been revoked by the chat owner.',
  server_not_claimed_use_claim_token:
    "This server hasn't been set up yet. Paste the operator claim token instead.",
  internal_error: 'The server hit an internal error. Try again later.',
  network_error:
    'Could not reach the server. Check the URL and your connection.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

export async function submitRedeemInvite(args: {
  serverUrl: string;
  inviteToken: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<RedeemInviteResult> {
  const {serverUrl, inviteToken, identity} = args;
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(serverUrl);

  const did = `did:yawp:${identity.did}`;
  const pkB64 = bytesToBase64Url(identity.masterPk);

  const canonical = canonicalJson({
    token: inviteToken,
    did,
    pk: pkB64,
  });

  const encoded = new TextEncoder().encode(canonical);
  const sig = identity.sign(encoded);
  const senderSignature = bytesToBase64Url(sig);

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  let result;
  try {
    result = await redeemServerInvite({
      input: {token: inviteToken, did, pk: pkB64, senderSignature},
      fields: ['serverId', 'role'],
      customFetch,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: `${SLUG_MESSAGES.network_error} (${(e as Error)?.message ?? e})`,
    };
  }

  if (result.success) {
    const d = result.data as {serverId?: string; role?: string};
    return {
      ok: true,
      serverId: d.serverId ?? '',
      role: d.role ?? 'Member',
    };
  }

  const first = result.errors[0];
  const slug = first?.type ?? 'internal_error';
  const status = slug === 'network_error' ? 0 : 400;

  return {
    ok: false,
    status,
    error: slug,
    message: humanize(slug, first?.message ?? 'Server returned an error.'),
  };
}
