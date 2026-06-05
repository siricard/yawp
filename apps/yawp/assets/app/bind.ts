
import {bindDevice} from './ash_generated';
import {bytesToBase64Url} from './claim';
import {canonicalJson} from './canonical-json';
import {saveSession, type StoredSession} from './session-storage';
import type {Identity} from './identity-context';

export type BindSuccess = {
  ok: true;
  session: StoredSession;
  profileVersion: number;
  publishedProfile: {
    anchors: string[];
  };
};

export type BindFailure = {
  ok: false;
  error: string;
  message: string;
};

export type BindResult = BindSuccess | BindFailure;

const SLUG_MESSAGES: Record<string, string> = {
  identity_not_found: 'The server does not know this identity yet.',
  invalid_payload: 'The server rejected the bind payload.',
  invalid_signature: 'The server rejected the request signature.',
  invalid_device_delegation:
    'The device delegation signature did not verify against the master key.',
  network_error:
    'Could not reach the server. Check the URL and your connection.',
  internal_error: 'The server hit an internal error. Try again later.',
};

function humanize(slug: string, fallback: string): string {
  return SLUG_MESSAGES[slug] ?? fallback;
}

function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function normalizeAnchorHost(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed).host;
  }
  return trimmed;
}

function normalizeAnchorList(anchors: string[]): string[] {
  return anchors.map(normalizeAnchorHost);
}

export async function submitBindDevice(args: {
  serverUrl: string;
  identity: Identity;
  fetchImpl?: typeof fetch;
}): Promise<BindResult> {
  const {serverUrl, identity} = args;
  const baseFetch = args.fetchImpl ?? fetch;
  const base = normalizeServerUrl(serverUrl);

  const did = identity.didFull;
  const deviceId = identity.deviceId;
  const devicePk = bytesToBase64Url(identity.devicePk);
  const deviceSignature = bytesToBase64Url(identity.deviceDelegationSignature);
  const deviceIssuedAt = identity.deviceIssuedAt;
  const requestIssuedAt = new Date().toISOString();

  const canonical = canonicalJson({
    did,
    device_id: deviceId,
    device_pk: devicePk,
    device_signature: deviceSignature,
    device_issued_at: deviceIssuedAt,
    request_issued_at: requestIssuedAt,
  });
  const encoded = new TextEncoder().encode(canonical);
  const senderSig = identity.signDevice(encoded);
  const senderSignature = bytesToBase64Url(senderSig);

  const customFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/rpc/')) {
      return baseFetch(`${base}${input}`, init);
    }
    return baseFetch(input as RequestInfo, init);
  };

  let result;
  try {
    result = await bindDevice({
      identity: {did},
      input: {
        deviceId,
        devicePk,
        deviceSignature,
        senderSignature,
        deviceIssuedAt,
        requestIssuedAt,
      },
      fields: ['id', 'did', 'anchorList', 'profileVersion'],
      metadataFields: ['sessionToken', 'refreshToken', 'expiresAt'],
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
    const meta = result.metadata as {
      sessionToken?: string;
      refreshToken?: string;
      expiresAt?: string;
    };
    if (!meta.sessionToken || !meta.refreshToken || !meta.expiresAt) {
      return {
        ok: false,
        error: 'internal_error',
        message: 'Server omitted session tokens from the bind response.',
      };
    }
    const session: StoredSession = {
      sessionToken: meta.sessionToken,
      refreshToken: meta.refreshToken,
      expiresAt: meta.expiresAt,
    };
    const data = result.data as {
      anchorList?: string[];
      profileVersion?: number;
    };
    await saveSession(base, session);
    return {
      ok: true,
      session,
      profileVersion: data.profileVersion ?? 0,
      publishedProfile: {
        anchors: normalizeAnchorList(data.anchorList ?? [base]),
      },
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
