
import {canonicalJson} from './canonical-json';
import {claimChatOwner} from './ash_generated';
import type {Identity} from './identity-context';

export type ClaimSuccess = {
  ok: true;
  did: string;
  role: string;
};

export type ClaimFailure = {
  ok: false;
  status: number;
  /** error slug, or `"network_error"` for fetch/transport failures. */
  error: string;
  /** Human-readable rendition for inline display. */
  message: string;
};

export type ClaimResult = ClaimSuccess | ClaimFailure;

/** Strip a trailing slash so paths concat cleanly. */
function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** Base64url-without-padding encoding of a byte array. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : 
        Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const SLUG_MESSAGES: Record<string, string> = {
  invalid_payload: 'The server rejected the claim payload.',
  claim_token_invalid: 'That claim token is not recognized by the server.',
  claim_token_consumed: 'This claim token has already been used.',
  claim_token_revoked: 'This claim token has been revoked by the operator.',
  claim_token_expired: 'This claim token has expired.',
  did_mismatch: 'The DID did not match the public key.',
  invalid_signature: 'The server rejected the request signature.',
  internal_error: 'The server hit an internal error. Try again later.',
  network_error:
    'Could not reach the server. Check the URL and your connection.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

/**
 * Build the canonical-JSON payload, sign it with the persisted identity,
 * and dispatch through the generated `claimChatOwner` RPC binding.
 *
 * The RPC endpoint lives at `${serverUrl}/rpc/run`. We override the
 * generated binding's default fetch so callers can target a remote
 * anchor (not just the current page's origin) and so tests can inject
 * a fake fetch.
 */
export async function submitClaim(args: {
  serverUrl: string;
  claimToken: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<ClaimResult> {
  const {serverUrl, claimToken, identity} = args;
  const baseFetch = args.fetchImpl ?? fetch;

  const base = normalizeServerUrl(serverUrl);

  const did = `did:yawp:${identity.did}`;
  const pkB64 = bytesToBase64Url(identity.masterPk);

  const canonical = canonicalJson({
    claim_token: claimToken,
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
    result = await claimChatOwner({
      input: {claimToken, did, pk: pkB64, senderSignature},
      fields: ['id', 'did'],
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
    return {
      ok: true,
      did: (result.data as {did?: string}).did ?? did,
      role: 'Owner',
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
