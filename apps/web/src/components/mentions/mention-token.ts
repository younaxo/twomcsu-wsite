/// Токен упоминания: `@` в начале текста или после пробела/перевода строки,
/// затем символы ника `[A-Za-z0-9_]` до курсора.
export interface MentionToken {
  /// Индекс символа `@`.
  start: number;
  /// Позиция курсора (конец токена).
  end: number;
  /// Текст после `@` до курсора.
  query: string;
}

export const MENTION_MIN_LENGTH = 2;

const NICK_CHAR = /[A-Za-z0-9_]/;

export function findMentionToken(value: string, caret: number): MentionToken | null {
  if (caret < 1 || caret > value.length) return null;
  let i = caret;
  while (i > 0 && NICK_CHAR.test(value[i - 1] as string)) i -= 1;
  if (i < 1 || value[i - 1] !== '@') return null;
  const at = i - 1;
  if (at > 0 && !/\s/.test(value[at - 1] as string)) return null;
  return { start: at, end: caret, query: value.slice(i, caret) };
}

/// Заменяет токен на `@ник ` и возвращает новый текст и позицию курсора.
export function applyMention(
  value: string,
  token: MentionToken,
  username: string,
): { value: string; caret: number } {
  const insert = `@${username} `;
  const rest = value.slice(token.end);
  // Если после курсора уже пробел, не удваиваем его.
  const tail = rest.startsWith(' ') ? rest.slice(1) : rest;
  const next = value.slice(0, token.start) + insert + tail;
  return { value: next, caret: token.start + insert.length };
}
