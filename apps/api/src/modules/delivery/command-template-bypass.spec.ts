import {
  CommandTemplateError,
  DURATION_TOKENS,
  renderCommand,
  validateRenderedCommand,
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

/// R155: обходы нормализации и белый список форм (Q112). Нормализации нет
/// сознательно: любое нестандартное написание отклоняется, а не «исправляется».
describe('обходы нормализации шаблона (R155)', () => {
  it.each([
    ['LP user {username} parent add vip', null],
    ['lp user {username} parent addtemp vip {duration}', null],
    ['lp user {username} parent set vip', null],
    ['eco give {username} 12.5', null],
    ['crate key give {username} vote 2', null],
    ['cratekey give {username} vote', null],
    ['give {username} minecraft:diamond 3', null],
    ['lp user {username} parent add vip ', null],
    // пробелы, слэш, namespace
    ['lp  user {username} parent add vip', 'template_form_not_allowed'],
    ['lp user  {username} parent add vip', 'template_form_not_allowed'],
    ['/lp user {username} parent add vip', 'template_leading_slash'],
    ['//lp user {username} parent add vip', 'template_leading_slash'],
    ['minecraft:give {username} diamond', 'root_not_allowed'],
    ['bukkit:give {username} diamond', 'root_not_allowed'],
    ['luckperms:lp user {username} parent add vip', 'root_not_allowed'],
    ['MINECRAFT:OP {username}', 'root_forbidden'],
    ['minecraft:execute as {username}', 'root_forbidden'],
    ['minecraft:stop', 'root_forbidden'],
    ['save-on', 'root_forbidden'],
    // табы, переводы строк, цепочки
    ['lp\tuser {username} parent add vip', 'template_control_chars'],
    ['\tlp user {username} parent add vip', 'template_control_chars'],
    ['give {username} diamond\nop {username}', 'template_control_chars'],
    ['give {username} diamond\rstop', 'template_control_chars'],
    ['give {username} diamond\u0085stop', 'template_control_chars'],
    ['give {username} diamond;op {username}', 'template_forbidden_chars'],
    ['give {username} diamond && stop', 'template_forbidden_chars'],
    ['give {username} diamond || stop', 'template_forbidden_chars'],
    ['give {username} diamond | tee', 'template_forbidden_chars'],
    // unicode: гомоглифы, NFKC, нулевая ширина, неразрывные пробелы
    ['ｌp user {username} parent add vip', 'template_forbidden_chars'],
    ['lр user {username} parent add vip', 'template_forbidden_chars'],
    ['gіve {username} diamond', 'template_forbidden_chars'],
    ['lp​user {username} parent add vip', 'template_forbidden_chars'],
    ['​lp user {username} parent add vip', 'template_forbidden_chars'],
    [' lp user {username} parent add vip', 'template_forbidden_chars'],
    ['give {username} diamond', 'template_forbidden_chars'],
    ['give {username} diamond', 'template_forbidden_chars'],
    ['﻿give {username} diamond', 'template_forbidden_chars'],
    ['give {username} diamond‮op', 'template_forbidden_chars'],
    // ник: селекторы, литералы, чужие ники
    ['give all diamond', 'template_username_required'],
    ['lp user all parent add vip {username}', 'template_form_not_allowed'],
    ['lp user Notch parent add vip', 'template_username_required'],
    ['give {username} @a', 'template_forbidden_chars'],
    ['give {username} *', 'template_forbidden_chars'],
    ['give @a diamond {username}', 'template_forbidden_chars'],
    // форма
    ['lp user {username} permission set vip', 'template_form_not_allowed'],
    ['lp user {username} parent add vip 5x', 'template_form_not_allowed'],
    ['lp user {username} parent add vip 30d x', 'template_form_not_allowed'],
    ['lp {username} user parent add vip', 'template_form_not_allowed'],
    ['give {username}', 'template_form_not_allowed'],
    ['give {username} diamond {duration}', 'template_form_not_allowed'],
    ['eco give {username} -5', 'template_form_not_allowed'],
    ['eco set {username} 5', 'template_form_not_allowed'],
    ['crate give {username}', 'template_form_not_allowed'],
  ])('%j -> %s', (template, code) => {
    expect(codeOf(() => validateTemplate(template))).toBe(code);
  });

  it('срок из любого варианта перечня подставляется в допустимое место', () => {
    const tpl = 'lp user {username} parent addtemp vip {duration}';
    for (const d of Object.keys(DURATION_TOKENS)) {
      expect(renderCommand(tpl, { username: 'Steve', duration: d })).toContain(
        DURATION_TOKENS[d],
      );
    }
  });

  it('корень из расширения форму не проверяет, а корень по умолчанию - всегда', () => {
    expect(validateTemplate('tell {username} hi', ['tell'])).toBe(
      'tell {username} hi',
    );
    expect(
      codeOf(() =>
        validateTemplate('lp user {username} permission set x', ['lp']),
      ),
    ).toBe('template_form_not_allowed');
  });
});

describe('повторная проверка готовой команды (R155, паритет с плагином)', () => {
  it.each([
    'lp user Steve permission set vip',
    'give Steve',
    'lp  user Steve parent add vip',
    'lp user all parent add vip',
    'lp user Steve parent add vip 5x',
    'minecraft:give Steve diamond',
    'give Steve diamond 1;op',
    'give Steve diamond​',
    'GIVE Steve diamond\t1',
  ])('отклоняет %j', (c) => {
    expect(() => validateRenderedCommand(c)).toThrow(CommandTemplateError);
  });

  it('пропускает формы из шаблонов', () => {
    expect(
      validateRenderedCommand('lp user Steve parent addtemp vip 30d'),
    ).toBe('lp user Steve parent addtemp vip 30d');
    expect(validateRenderedCommand('LP USER Steve PARENT ADD vip')).toBe(
      'LP USER Steve PARENT ADD vip',
    );
  });

  it('ник при подстановке: только [A-Za-z0-9_]{3,16}, без селекторов', () => {
    const tpl = 'give {username} diamond';
    const bad = [
      '@a',
      '@e[type=player]',
      '*',
      'all',
      'ALL',
      'a b',
      'Ab',
      'x'.repeat(17),
      'Ste​ve',
      'Ｓteve',
    ];
    for (const nick of bad) {
      expect(
        codeOf(() =>
          renderCommand(tpl, { username: nick, duration: 'WEEK_1' }),
        ),
      ).toBe('invalid_nick');
    }
  });
});

/// Слот ника — ТОЛЬКО токен {username}: литерал (в т.ч. Steve) отвергается,
/// {username} в слотах группы/предмета/ключа тоже.
describe('слот ника только {username} (R155)', () => {
  it.each([
    'give Steve {username}',
    'lp user Steve parent set {username}',
    'lp user Steve parent add {username}',
    'lp user Alex parent add vip {duration} {username}',
    'lp user {username} parent set {username}',
    'lp user {username} parent add {username} {duration}',
    'give {username} {username}',
    'give {username} {username} 2',
    'crate key give {username} {username}',
    'eco give Steve 10 {username}',
  ])('отвергает %s', (tpl) => {
    expect(codeOf(() => validateTemplate(tpl))).toBe(
      'template_form_not_allowed',
    );
  });

  it.each([
    'lp user {username} parent set vip',
    'lp user {username} parent addtemp vip {duration}',
    'give {username} diamond 3',
    'crate key give {username} vote 2',
  ])('принимает %s', (tpl) => {
    expect(codeOf(() => validateTemplate(tpl))).toBeNull();
  });
});
