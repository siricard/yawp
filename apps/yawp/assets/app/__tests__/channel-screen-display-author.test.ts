
import {displayAuthor} from '../screens/ChannelScreen';
import vector from '../../../priv/test_vectors/identity.json';

describe('displayAuthor', () => {
  test('renders the full did:yawp:<base58> form for short bases', () => {
    expect(displayAuthor('abcd')).toBe('did:yawp:abcd');
  });

  test('truncates long bases as did:yawp:<head>…<tail>', () => {
    const base58 = vector.did;
    const full = `did:yawp:${base58}`;
    const out = displayAuthor(base58);

    expect(out.startsWith('did:yawp:')).toBe(true);
    expect(out.startsWith(full.slice(0, 12))).toBe(true);
    expect(out).toContain('…');
    expect(out.endsWith(full.slice(-4))).toBe(true);
    expect(out.length).toBe(17);
  });

  test('boundary case: exactly 18 chars renders un-truncated', () => {
    expect(displayAuthor('abcdefghi')).toBe('did:yawp:abcdefghi');
  });

  test('boundary case: 19 chars triggers truncation', () => {
    const out = displayAuthor('abcdefghij');
    expect(out).toContain('…');
    expect(out.length).toBe(17);
  });
});
