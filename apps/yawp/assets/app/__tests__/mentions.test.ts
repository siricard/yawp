import {
  mentionsSelf,
  parseMessageTokens,
  type MessageToken,
} from '../chat/mentions';

function mentions(tokens: MessageToken[]) {
  return tokens.filter(t => t.kind === 'mention');
}

describe('parseMessageTokens', () => {
  test('plain text yields a single text token', () => {
    expect(parseMessageTokens('hello world')).toEqual([
      {kind: 'text', value: 'hello world'},
    ]);
  });

  test('parses an @user mention with surrounding text', () => {
    const tokens = parseMessageTokens('hey @nova check this');
    expect(tokens[0]).toEqual({kind: 'text', value: 'hey '});
    expect(tokens[1]).toEqual({
      kind: 'mention',
      mentionKind: 'user',
      value: 'nova',
      label: '@nova',
    });
    expect(tokens[2]).toEqual({kind: 'text', value: ' check this'});
  });

  test('parses @everyone and @here as special mentions', () => {
    const tokens = mentions(parseMessageTokens('@everyone and @here now'));
    expect(tokens.map(t => t.kind === 'mention' && t.mentionKind)).toEqual([
      'everyone',
      'here',
    ]);
  });

  test('parses an @&role mention', () => {
    const tokens = mentions(parseMessageTokens('ping @&core-team please'));
    expect(tokens[0]).toEqual({
      kind: 'mention',
      mentionKind: 'role',
      value: 'core-team',
      label: '@core-team',
    });
  });

  test('parses inline code spans', () => {
    const tokens = parseMessageTokens('use `useChannel` here');
    expect(tokens[1]).toEqual({kind: 'code', value: 'useChannel'});
  });

  test('handles multiple mentions in one message', () => {
    const tokens = mentions(parseMessageTokens('@a @b @everyone'));
    expect(tokens).toHaveLength(3);
  });
});

describe('mentionsSelf', () => {
  test('matches @everyone regardless of handles', () => {
    expect(mentionsSelf(parseMessageTokens('@everyone hi'), [])).toBe(true);
  });

  test('matches a user mention case-insensitively', () => {
    expect(mentionsSelf(parseMessageTokens('hey @Nova'), ['nova'])).toBe(true);
  });

  test('does not match an unrelated user mention', () => {
    expect(mentionsSelf(parseMessageTokens('hey @ren'), ['nova'])).toBe(false);
  });

  test('matches a role mention by handle', () => {
    expect(mentionsSelf(parseMessageTokens('@&admins ping'), ['admins'])).toBe(
      true,
    );
  });
});
