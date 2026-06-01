export type ParsedInviteLink = {
  serverUrl: string;
  token: string;
};

function decodeB64Url(input: string): string | null {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  try {
    if (typeof atob === 'function') {
      return atob(withPad);
    }
    return Buffer.from(withPad, 'base64').toString('binary');
  } catch {
    return null;
  }
}

function normalizeServerUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return `${url.protocol}//${url.host}`;
}

function parseYawpScheme(raw: string): ParsedInviteLink | null {
  const rest = raw.slice('yawp://invite/'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) {
    return null;
  }
  const encodedUrl = rest.slice(0, slash);
  const token = rest.slice(slash + 1);
  if (!token) {
    return null;
  }
  const decodedUrl = decodeB64Url(encodedUrl);
  if (!decodedUrl) {
    return null;
  }
  const serverUrl = normalizeServerUrl(decodedUrl);
  if (!serverUrl) {
    return null;
  }
  return {serverUrl, token};
}

function parseHttpLink(raw: string): ParsedInviteLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const segments = url.pathname.split('/').filter(s => s.length > 0);
  if (segments[0] !== 'invite') {
    return null;
  }

  const serverUrl = `${url.protocol}//${url.host}`;

  const fragmentToken = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (fragmentToken) {
    return {serverUrl, token: fragmentToken};
  }

  if (segments.length >= 2 && segments[1]) {
    return {serverUrl, token: segments[1]};
  }

  return null;
}

/**
 * Parse a pasted invite/claim link into `{ serverUrl, token }`, or
 * return `null` when the input is not a recognized full link.
 *
 * Accepted forms:
 *   - `https://server.tld/invite#<token>` (anchor fragment, preferred)
 *   - `https://server.tld/invite/<token>` (path)
 *   - `yawp://invite/<base64url(serverUrl)>/<token>` (deep link)
 */
export function parseInviteLink(input: string): ParsedInviteLink | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('yawp://invite/')) {
    return parseYawpScheme(trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return parseHttpLink(trimmed);
  }

  return null;
}
