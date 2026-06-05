export function normalizeAnchorServerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('http:') || trimmed.startsWith('https:')) {
    return trimmed;
  }
  const scheme = loopbackHost(trimmed) ? 'http:' : 'https:';
  return [scheme, urlHost(trimmed)].join(`/${'/'}`);
}

function loopbackHost(raw: string): boolean {
  const parsed = hostOnly(raw);
  return parsed === 'localhost' || parsed === '127.0.0.1' || parsed === '::1';
}

function hostOnly(raw: string): string {
  if (raw === '::1') return raw;
  const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const withoutPort = raw.split(':')[0];
  return withoutPort.toLowerCase();
}

function urlHost(raw: string): string {
  return raw === '::1' ? '[::1]' : raw;
}
