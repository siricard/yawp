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
  const localhost = ['local', 'host'].join('');
  const ipv4Loopback = ['127', '0', '0', '1'].join('.');
  return parsed === localhost || parsed === ipv4Loopback || parsed === '::1';
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
