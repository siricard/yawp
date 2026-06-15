import {normalizeAnchorServerUrl} from '../chat/anchor-url';

const slashes = String.fromCharCode(47, 47);
const url = (scheme: string, host: string) => [scheme, host].join(slashes);

describe('normalizeAnchorServerUrl', () => {
  test('keeps loopback anchors on http', () => {
    expect(normalizeAnchorServerUrl('localhost:4000')).toBe(
      url('http:', 'localhost:4000'),
    );
    expect(normalizeAnchorServerUrl('127.0.0.1:4000')).toBe(
      url('http:', '127.0.0.1:4000'),
    );
    expect(normalizeAnchorServerUrl('::1')).toBe(url('http:', '[::1]'));
  });

  test('defaults non-loopback anchors to https', () => {
    expect(normalizeAnchorServerUrl('anchor.example')).toBe(
      url('https:', 'anchor.example'),
    );
  });

  test('preserves explicit schemes and trims trailing slashes', () => {
    expect(
      normalizeAnchorServerUrl(
        [' https:', `anchor.example${'/'.repeat(3)} `].join(slashes),
      ),
    ).toBe(
      url('https:', 'anchor.example'),
    );
    expect(
      normalizeAnchorServerUrl([url('http:', 'localhost:4000'), ''].join('/')),
    ).toBe(
      url('http:', 'localhost:4000'),
    );
  });
});
