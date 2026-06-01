import {canonicalJson} from './canonical-json';
import {bytesToBase64Url} from './claim';
import {redeemRoomInvite} from './ash_generated';
import type {Identity} from './identity-context';

export type RedeemRoomInviteSuccess = {
  ok: true;
  serverId: string;
  channelId: string;
  /** Membership kind after redeem — `"guest"` for a freshly promoted stranger. */
  kind: string;
};

export type RedeemRoomInviteFailure = {
  ok: false;
  status: number;
  error: string;
  message: string;
};

export type RedeemRoomInviteResult =
  | RedeemRoomInviteSuccess
  | RedeemRoomInviteFailure;

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

const SLUG_MESSAGES: Record<string, string> = {
  invalid_payload: 'The server rejected the invite payload.',
  invalid_signature: 'The server rejected the request signature.',
  did_mismatch: 'The DID did not match the public key.',
  invite_token_invalid: 'That invite link is not recognized by the server.',
  invite_token_consumed: 'This invite link has already been used.',
  invite_token_exhausted: 'This invite link has no uses remaining.',
  invite_token_expired: 'This invite link has expired.',
  invite_token_revoked: 'This invite link has been revoked.',
  internal_error: 'The server hit an internal error. Try again later.',
  network_error:
    'Could not reach the server. Check the URL and your connection.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

export async function submitRedeemRoomInvite(args: {
  serverUrl: string;
  inviteToken: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<RedeemRoomInviteResult> {
  const {serverUrl, inviteToken, identity} = args;
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(serverUrl);

  const did = `did:yawp:${identity.did}`;
  const pkB64 = bytesToBase64Url(identity.masterPk);

  const canonical = canonicalJson({token: inviteToken, did, pk: pkB64});
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
    result = await redeemRoomInvite({
      input: {token: inviteToken, did, pk: pkB64, senderSignature},
      fields: ['serverId', 'channelId', 'kind'],
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
    const d = result.data as {
      serverId?: string;
      channelId?: string;
      kind?: string;
    };
    return {
      ok: true,
      serverId: d.serverId ?? '',
      channelId: d.channelId ?? '',
      kind: d.kind ?? 'guest',
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
