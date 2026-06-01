import {parseInviteLink} from '../onboarding/parseInviteLink';

function b64url(s: string): string {
  return Buffer.from(s, 'binary')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('parseInviteLink', () => {
  test('parses https anchor-fragment form', () => {
    expect(parseInviteLink('https://chat.example.com/invite#ABCDEF123456')).toEqual({
      serverUrl: 'https://chat.example.com',
      token: 'ABCDEF123456',
    });
  });

  test('parses https path form', () => {
    expect(parseInviteLink('https://chat.example.com/invite/ABCDEF123456')).toEqual({
      serverUrl: 'https://chat.example.com',
      token: 'ABCDEF123456',
    });
  });

  test('parses http (non-TLS) links with a port', () => {
    expect(parseInviteLink('http://localhost:4000/invite#TOK123')).toEqual({
      serverUrl: 'http://localhost:4000',
      token: 'TOK123',
    });
  });

  test('parses yawp:// deep link with base64url-encoded server url', () => {
    const link = `yawp://invite/${b64url('https://chat.example.com')}/TOK999`;
    expect(parseInviteLink(link)).toEqual({
      serverUrl: 'https://chat.example.com',
      token: 'TOK999',
    });
  });

  test('fragment wins over path when both present', () => {
    expect(
      parseInviteLink('https://chat.example.com/invite/PATHTOK#FRAGTOK'),
    ).toEqual({
      serverUrl: 'https://chat.example.com',
      token: 'FRAGTOK',
    });
  });

  test('trims surrounding whitespace', () => {
    expect(parseInviteLink('   https://h.tld/invite#T  ')).toEqual({
      serverUrl: 'https://h.tld',
      token: 'T',
    });
  });

  test('returns null for a bare server URL (no /invite path)', () => {
    expect(parseInviteLink('https://chat.example.com')).toBeNull();
    expect(parseInviteLink('http://localhost:4000')).toBeNull();
  });

  test('returns null for a raw token', () => {
    expect(parseInviteLink('ABCDEF123456')).toBeNull();
  });

  test('returns null for /invite with no token', () => {
    expect(parseInviteLink('https://chat.example.com/invite')).toBeNull();
    expect(parseInviteLink('https://chat.example.com/invite#')).toBeNull();
    expect(parseInviteLink('https://chat.example.com/invite/')).toBeNull();
  });

  test('returns null for malformed yawp:// links', () => {
    expect(parseInviteLink('yawp://invite/TOK')).toBeNull();
    expect(parseInviteLink(`yawp://invite/${b64url('https://h.tld')}/`)).toBeNull();
    expect(parseInviteLink('yawp://invite//TOK')).toBeNull();
  });

  test('returns null for unsupported schemes and junk', () => {
    expect(parseInviteLink('ftp://h.tld/invite#T')).toBeNull();
    expect(parseInviteLink('javascript:alert(1)')).toBeNull();
    expect(parseInviteLink('')).toBeNull();
    expect(parseInviteLink('   ')).toBeNull();
  });
});
