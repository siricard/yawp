export type MessageToken =
  | {kind: 'text'; value: string}
  | {kind: 'code'; value: string}
  | {kind: 'mention'; mentionKind: MentionKind; value: string; label: string};

export type MentionKind = 'everyone' | 'here' | 'role' | 'user';

const TOKEN_PATTERN =
  /`([^`]+)`|@everyone\b|@here\b|@&([A-Za-z0-9_-]+)|@([A-Za-z0-9_.-]+)/g;

function roleLabel(raw: string): string {
  return `@${raw}`;
}

export function parseMessageTokens(body: string): MessageToken[] {
  const tokens: MessageToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;

  while ((match = TOKEN_PATTERN.exec(body)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({kind: 'text', value: body.slice(lastIndex, match.index)});
    }
    const [whole, code, role, user] = match;
    if (code !== undefined) {
      tokens.push({kind: 'code', value: code});
    } else if (whole === '@everyone') {
      tokens.push({
        kind: 'mention',
        mentionKind: 'everyone',
        value: 'everyone',
        label: '@everyone',
      });
    } else if (whole === '@here') {
      tokens.push({
        kind: 'mention',
        mentionKind: 'here',
        value: 'here',
        label: '@here',
      });
    } else if (role !== undefined) {
      tokens.push({
        kind: 'mention',
        mentionKind: 'role',
        value: role.trim(),
        label: roleLabel(role),
      });
    } else if (user !== undefined) {
      tokens.push({
        kind: 'mention',
        mentionKind: 'user',
        value: user,
        label: `@${user}`,
      });
    }
    lastIndex = match.index + whole.length;
  }

  if (lastIndex < body.length) {
    tokens.push({kind: 'text', value: body.slice(lastIndex)});
  }

  return tokens;
}

export function mentionsSelf(
  tokens: MessageToken[],
  selfHandles: string[],
): boolean {
  const handles = new Set(selfHandles.map(h => h.toLowerCase()));
  return tokens.some(
    t =>
      t.kind === 'mention' &&
      (t.mentionKind === 'everyone' ||
        t.mentionKind === 'here' ||
        ((t.mentionKind === 'user' || t.mentionKind === 'role') &&
          handles.has(t.value.toLowerCase()))),
  );
}
