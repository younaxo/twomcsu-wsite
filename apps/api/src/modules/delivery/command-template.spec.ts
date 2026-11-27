import {
  CommandTemplateError,
  DURATION_TOKENS,
  RENDERED_COMMAND_MAX_LENGTH,
  TEMPLATE_MAX_LENGTH,
  normalizeRoots,
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
    'give {username} diamond',
    '  eco give {username} 100  ',
  ])('принимает %j', (t) => {
    expect(validateTemplate(t)).toBe(t.trim());
  });

  it.each([
    ['give {username}; op {username}', 'template_forbidden_chars'],
    ['give {username} && stop', 'template_forbidden_chars'],
    ['give {username} | tee x', 'template_forbidden_chars'],
    ['give $(whoami) {username}', 'template_forbidden_chars'],
    ['give `id` {username}', 'template_forbidden_chars'],
    ['give {username} > f', 'template_forbidden_chars'],
    ['give {username} "x"', 'template_forbidden_chars'],
    ['give {username} \\n', 'template_forbidden_chars'],
    ['give {username} @a', 'template_forbidden_chars'],
    ['give {username} %s', 'template_forbidden_chars'],
    ['give {username} ${x}', 'template_unknown_variable'],
    ['give {username} ｓ', 'template_forbidden_chars'],
    ['give {username}\nstop', 'template_control_chars'],
    ['give {username}\r\nstop', 'template_control_chars'],
    ['give {username}\u0000', 'template_control_chars'],
    ['give {username}\u2028op', 'template_control_chars'],
    ['/unban {username}', 'template_leading_slash'],
    ['give {nick}', 'template_unknown_variable'],
    ['give {USERNAME}', 'template_unknown_variable'],
    ['give {username', 'template_forbidden_chars'],
    ['give username}', 'template_forbidden_chars'],
    ['give {{username}}', 'template_forbidden_chars'],
    ['give {}', 'template_unknown_variable'],
    ['give now', 'template_username_required'],
    ['give {duration}', 'template_username_required'],
    ['', 'template_empty'],
    ['   ', 'template_empty'],
    [
      'give {username} {username} {username} {username} {username}',
      'template_too_many_variables',
    ],
  ])('отклоняет %j как %s', (t, code) => {
    expect(codeOf(() => validateTemplate(t))).toBe(code);
  });

  it('длина шаблона ограничена', () => {
    const ok =
      'tell ' +
      'a'.repeat(TEMPLATE_MAX_LENGTH - 'tell '.length - '{username}'.length) +
      '{username}';
    expect(ok.length).toBe(TEMPLATE_MAX_LENGTH);
    expect(validateTemplate(ok, ['tell'])).toBe(ok);
    expect(codeOf(() => validateTemplate(ok + 'a', ['tell']))).toBe(
      'template_too_long',
    );
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
      renderCommand('give {username} {username}', {
        username: 'Alex',
        duration: 'FOREVER',
      }),
    ).toBe('give Alex Alex');
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
        renderCommand('give {username}; y', {
          username: 'Steve',
          duration: 'WEEK_1',
        }),
      ),
    ).toBe('template_forbidden_chars');
  });
});

describe('белый список корней команд (0.11, ADR-0189)', () => {
  it('по умолчанию разрешены lp, luckperms, give, crate, cratekey, eco', () => {
    const samples: Record<string, string> = {
      lp: 'lp user {username} parent add vip',
      luckperms: 'luckperms user {username} parent set vip',
      give: 'give {username} diamond 2',
      crate: 'crate give {username} vote 1',
      cratekey: 'cratekey key give {username} vote',
      eco: 'eco give {username} 12.5',
    };
    for (const r of Object.keys(samples)) {
      expect(validateTemplate(samples[r])).toBe(samples[r]);
    }
    expect(validateTemplate('LP user {username} parent add vip')).toBe(
      'LP user {username} parent add vip',
    );
  });

  it('корень вне списка отклоняется, расширение его разрешает', () => {
    expect(codeOf(() => validateTemplate('unban {username}'))).toBe(
      'root_not_allowed',
    );
    expect(validateTemplate('unban {username}', ['unban'])).toBe(
      'unban {username}',
    );
  });

  it.each([
    'op',
    'deop',
    'stop',
    'reload',
    'whitelist',
    'ban-ip',
    'execute',
    'sudo',
    'console',
    'plugman',
    'OP',
  ])('запрет %s сильнее расширения', (root) => {
    expect(
      codeOf(() =>
        validateTemplate(`${root} {username}`, [root.toLowerCase()]),
      ),
    ).toBe('root_forbidden');
    expect(codeOf(() => normalizeRoots([root]))).toBe('root_forbidden');
  });

  it('normalizeRoots: нормализует, убирает дубли, отклоняет мусор', () => {
    expect(normalizeRoots('Foo, foo ,bar-1,')).toEqual(['foo', 'bar-1']);
    expect(codeOf(() => normalizeRoots('a;b'))).toBe('root_invalid');
    expect(normalizeRoots(undefined)).toEqual([]);
  });
});
