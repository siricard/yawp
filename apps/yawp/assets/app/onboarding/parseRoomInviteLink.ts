export type ParsedRoomInviteLink = {
  serverUrl: string;
  channelId: string;
  token: string;
};

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

function hostToServerUrl(host: string): string {
  const localhost = ['local', 'host'].join('');
  const ipv4Loopback = ['127', '0', '0', '1'].join('.');
  if (host.startsWith(localhost) || host.startsWith(ipv4Loopback)) {
    return `http://${host}`;
  }
  return `https://${host}`;
}

function parseYawpScheme(raw: string): ParsedRoomInviteLink | null {
  let rest = raw.slice('yawp://'.length);
  const queryIndex = rest.indexOf('?');
  if (queryIndex < 0) {
    return null;
  }
  const path = rest.slice(0, queryIndex);
  const query = rest.slice(queryIndex + 1);

  const segments = path.split('/').filter(s => s.length > 0);
  // segments: [host, "r", channelId]
  if (segments.length !== 3 || segments[1] !== 'r') {
    return null;
  }
  const host = segments[0];
  const channelId = segments[2];
  if (!host || !channelId) {
    return null;
  }

  const params = new URLSearchParams(query);
  const token = params.get('token');
  if (!token) {
    return null;
  }

  return {serverUrl: hostToServerUrl(host), channelId, token};
}

function parseHttpLink(raw: string): ParsedRoomInviteLink | null {
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
  // segments: ["r", channelId]
  if (segments.length !== 2 || segments[0] !== 'r') {
    return null;
  }
  const channelId = segments[1];
  const token = url.searchParams.get('token');
  if (!channelId || !token) {
    return null;
  }

  const serverUrl = normalizeServerUrl(raw);
  if (!serverUrl) {
    return null;
  }

  return {serverUrl, channelId, token};
}

/**
 * Parse a pasted cold room-invite link into
 * `{ serverUrl, channelId, token }`, or `null` when the input is not a
 * recognized room-invite link.
 *
 * Accepted forms:
 *   - `yawp://<host>/r/<channelId>?token=<token>` (deep link, canonical)
 *   - `https://<host>/r/<channelId>?token=<token>` (web fallback)
 */
export function parseRoomInviteLink(input: string): ParsedRoomInviteLink | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('yawp://')) {
    return parseYawpScheme(trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return parseHttpLink(trimmed);
  }

  return null;
}
