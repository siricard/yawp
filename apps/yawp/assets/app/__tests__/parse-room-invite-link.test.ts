import {parseRoomInviteLink} from '../onboarding/parseRoomInviteLink';

describe('parseRoomInviteLink', () => {
  it('parses the canonical yawp:// cold-invite link', () => {
    const parsed = parseRoomInviteLink(
      'yawp://localhost:4000/r/abc-123?token=TOKEN26CHARSBASE32AAAAAAAA',
    );
    expect(parsed).toEqual({
      serverUrl: 'http://localhost:4000',
      channelId: 'abc-123',
      token: 'TOKEN26CHARSBASE32AAAAAAAA',
    });
  });

  it('uses https for non-local hosts on a yawp:// link', () => {
    const parsed = parseRoomInviteLink(
      'yawp://anchor.example/r/chan-9?token=ABC',
    );
    expect(parsed).toEqual({
      serverUrl: 'https://anchor.example',
      channelId: 'chan-9',
      token: 'ABC',
    });
  });

  it('parses an https web fallback link', () => {
    const parsed = parseRoomInviteLink(
      'https://anchor.example/r/chan-9?token=ABC',
    );
    expect(parsed).toEqual({
      serverUrl: 'https://anchor.example',
      channelId: 'chan-9',
      token: 'ABC',
    });
  });

  it('trims surrounding whitespace', () => {
    const parsed = parseRoomInviteLink(
      '  yawp://anchor.example/r/c?token=t  ',
    );
    expect(parsed?.token).toBe('t');
  });

  it('returns null for a link with no token', () => {
    expect(parseRoomInviteLink('yawp://anchor.example/r/chan-9')).toBeNull();
  });

  it('returns null for a server-invite style link', () => {
    expect(
      parseRoomInviteLink('https://anchor.example/invite#token'),
    ).toBeNull();
  });

  it('returns null for non-link input', () => {
    expect(parseRoomInviteLink('not a link')).toBeNull();
    expect(parseRoomInviteLink('')).toBeNull();
  });

  it('returns null for a wrong path shape', () => {
    expect(
      parseRoomInviteLink('yawp://anchor.example/x/chan?token=t'),
    ).toBeNull();
  });
});
