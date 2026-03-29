
import {canonicalJson} from './canonical-json';
import {signWithIdentity, type Identity} from './identity';

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
 * and POST to `<serverUrl>/api/claim`.
 *
 * For the identity is the "stub" produced by
 * `getOrCreateIdentity` — a persisted random Ed25519 seed. Once
 * lands real BIP-39 onboarding the same call site keeps working: the
 * identity argument is the only crypto material we touch.
 */
export async function submitClaim(args: {
  serverUrl: string;
  claimToken: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<ClaimResult> {
  const {serverUrl, claimToken, identity} = args;
  const doFetch = args.fetchImpl ?? fetch;

  const base = normalizeServerUrl(serverUrl);
  const url = `${base}/api/claim`;

  const did = `did:yawp:${identity.did}`;
  const pkB64 = bytesToBase64Url(identity.publicKey);

  const canonical = canonicalJson({
    claim_token: claimToken,
    did,
    pk: pkB64,
  });

  const encoded = new TextEncoder().encode(canonical);
  const sig = await signWithIdentity(encoded);
  const sigB64 = bytesToBase64Url(sig);

  const body = JSON.stringify({
    claim_token: claimToken,
    did,
    pk: pkB64,
    sender_signature: sigB64,
  });

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      message: `${SLUG_MESSAGES.network_error} (${(e as Error)?.message ?? e})`,
    };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
  }

  if (res.ok) {
    const j = (json ?? {}) as {did?: string; role?: string};
    return {
      ok: true,
      did: j.did ?? did,
      role: j.role ?? 'Owner',
    };
  }

  const slug =
    (json as {error?: string} | null)?.error ?? `http_${res.status}`;
  return {
    ok: false,
    status: res.status,
    error: slug,
    message: humanize(slug, `Server returned ${res.status}.`),
  };
}
