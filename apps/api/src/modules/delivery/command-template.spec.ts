import {
  CommandTemplateError,
  DURATION_TOKENS,
  RENDERED_COMMAND_MAX_LENGTH,
  TEMPLATE_MAX_LENGTH,
  renderCommand,
  validateTemplate,
} from './command-template';

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof CommandTemplateError) return error.code;
    throw error;
  }
}

describe('validateTemplate (0.11)', () => {
  it.each([
    'lp user {username} parent addtemp ares {duration}',
    'give {username} diamond 1',
    'unban {username}',
    '  mute-off {username}  ',
  ])('принимает %j', (t) => {
    expect(validateTemplate(t)).toBe(t.trim());
  });

  it.each([
    ['unban {username}; op {username}', 'template_forbidden_chars'],
    ['unban {username} && stop', 'template_forbidden_chars'],
    ['unban {username} | tee x', 'template_forbidden_chars'],
    ['unban $(whoami) {username}', 'template_forbidden_chars'],
    ['unban `id` {username}', 'template_forbidden_chars'],
    ['unban {username} > f', 'template_forbidden_chars'],
    ['unban {username} "x"', 'template_forbidden_chars'],
    ['unban {username} \\n', 'template_forbidden_chars'],
    ['unban {username} @a', 'template_forbidden_chars'],
    ['unban {username} %s', 'template_forbidden_chars'],
    ['unban {username} ${x}', 'template_unknown_variable'],
    ['unban {username} ｓ', 'template_forbidden_chars'],
    ['unban {username}\nstop', 'template_control_chars'],
    ['unban {username}\r\nstop', 'template_control_chars'],
    ['unban {username}\u0000', 'template_control_chars'],
    ['unban {username}\u2028op', 'template_control_chars'],
    ['/unban {username}', 'template_leading_slash'],
    ['unban {nick}', 'template_unknown_variable'],
    ['unban {USERNAME}', 'template_unknown_variable'],
    ['unban {username', 'template_forbidden_chars'],
    ['unban username}', 'template_forbidden_chars'],
    ['unban {{username}}', 'template_forbidden_chars'],
    ['unban {}', 'template_unknown_variable'],
    ['unban now', 'template_username_required'],
    ['unban {duration}', 'template_username_required'],
    ['', 'template_empty'],
    ['   ', 'template_empty'],
    [
      'a {username} {username} {username} {username} {username}',
      'template_too_many_variables',
    ],
  ])('отклоняет %j как %s', (t, code) => {
    expect(codeOf(() => validateTemplate(t))).toBe(code);
  });

  it('длина шаблона ограничена', () => {
    const ok =
      'a'.repeat(TEMPLATE_MAX_LENGTH - '{username}'.length) + '{username}';
    expect(ok.length).toBe(TEMPLATE_MAX_LENGTH);
    expect(validateTemplate(ok)).toBe(ok);
    expect(codeOf(() => validateTemplate(ok + 'a'))).toBe('template_too_long');
  });

  it('не строка отклоняется', () => {
    expect(codeOf(() => validateTemplate(undefined))).toBe('template_empty');
    expect(codeOf(() => validateTemplate({ a: 1 }))).toBe('template_empty');
  });
});

describe('renderCommand (0.11)', () => {
  const tpl = 'lp user {username} parent addtemp ares {duration}';

  it('подставляет ник и срок', () => {
    expect(
      renderCommand(tpl, { username: 'Steve_1', duration: 'MONTH_1' }),
    ).toBe('lp user Steve_1 parent addtemp ares 30d');
  });

  it('подставляет все вхождения', () => {
    expect(
      renderCommand('say {username} {username}', {
        username: 'Alex',
        duration: 'FOREVER',
      }),
    ).toBe('say Alex Alex');
  });

  it.each(Object.keys(DURATION_TOKENS))('срок %s из перечня', (d) => {
    expect(renderCommand(tpl, { username: 'Steve', duration: d })).toContain(
      DURATION_TOKENS[d],
    );
  });

  it.each([
    'ab',
    'a'.repeat(17),
    'Steve; op',
    'Steve Alex',
    'St$(id)ve',
    'Steve\n',
    '@a',
    'all',
    '*',
    '',
    'Стив123',
    '{duration}',
  ])('негодный ник %j отклоняется', (nick) => {
    expect(
      codeOf(() => renderCommand(tpl, { username: nick, duration: 'WEEK_1' })),
    ).toBe('invalid_nick');
  });

  it.each([
    undefined,
    null,
    5,
    'YEAR',
    'month_1',
    '30d',
    '__proto__',
    'constructor',
    'toString',
  ])('срок %j вне перечня отклоняется', (d) => {
    expect(
      codeOf(() => renderCommand(tpl, { username: 'Steve', duration: d })),
    ).toBe('invalid_duration');
  });

  it('ник максимальной длины подставляется, итог в пределах колонки', () => {
    const out = renderCommand(tpl, {
      username: 'A'.repeat(16),
      duration: 'MONTHS_3',
    });
    expect(out).toContain('A'.repeat(16));
    expect(out.length).toBeLessThanOrEqual(RENDERED_COMMAND_MAX_LENGTH);
  });

  it('значение переменной не интерпретируется как новая переменная', () => {
    // Ник проходит только [A-Za-z0-9_], фигурные скобки невозможны.
    expect(
      codeOf(() =>
        renderCommand(tpl, { username: '{duration}', duration: 'WEEK_1' }),
      ),
    ).toBe('invalid_nick');
  });

  it('повторно проверяет шаблон (плохой шаблон не рендерится)', () => {
    expect(
      codeOf(() =>
        renderCommand('x {username}; y', {
          username: 'Steve',
          duration: 'WEEK_1',
        }),
      ),
    ).toBe('template_forbidden_chars');
  });
});
