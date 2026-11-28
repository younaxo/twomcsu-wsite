import { isDeliverableNick } from './delivery-nick';

/// Шаблоны игровых команд выдачи (0.11, ADR-0189). Чистые функции без
/// обращений к БД: валидация шаблона и подстановка переменных.
///
/// Белый список переменных — только `{username}` и `{duration}`. Любой иной
/// `{...}`, одиночная скобка и любой символ вне белого списка отклоняются.
/// Подстановка идёт ТОЛЬКО через `renderCommand` (ник — `isDeliverableNick`,
/// срок — из перечня `DURATION_TOKENS`), итог проверяется повторно.

export const TEMPLATE_MAX_LENGTH = 200;
/// Предел колонки `delivery_tasks.renderedCommand`.
export const RENDERED_COMMAND_MAX_LENGTH = 256;
export const TEMPLATE_VARIABLES = ['username', 'duration'] as const;
const MAX_VARIABLE_USES = 4;

/// Срок варианта -> значение для игровой команды (допущение ADR-0189).
export const DURATION_TOKENS: Readonly<Record<string, string>> = {
  FOREVER: 'forever',
  MONTHS_3: '90d',
  MONTH_1: '30d',
  WEEK_1: '7d',
  SEASON: 'season',
  ONE_TIME: 'once',
};

/// Допустимый литерал вне переменных: латиница, цифры, пробел и `_ - . : , +`.
/// Всё остальное (`; & | $ \` ( ) < > \ " ' ! ? * / [ ] { } @ %`, переводы
/// строк, управляющие и не-ASCII символы) запрещено.
/// Белый список корней команд (первое слово шаблона, без учёта регистра).
/// Допущение ADR-0189: набор для выдачи групп и предметов. Расширяется
/// настройкой (`EXTRA_ROOTS_SETTING`) только по праву
/// `store.delivery.templates.manage`; запрет ниже сильнее расширения.
export const DEFAULT_COMMAND_ROOTS: readonly string[] = [
  'lp',
  'luckperms',
  'give',
  'crate',
  'cratekey',
  'eco',
];
/// Явный запрет: опасные и служебные команды не разрешаются никогда.
export const FORBIDDEN_COMMAND_ROOTS: readonly string[] = [
  'op',
  'deop',
  'stop',
  'restart',
  'reload',
  'rl',
  'whitelist',
  'ban',
  'ban-ip',
  'banip',
  'pardon',
  'pardon-ip',
  'kick',
  'execute',
  'sudo',
  'console',
  'plugman',
  'pl',
  'plugins',
  'minecraft:op',
  'save-all',
  'save-off',
  'save-on',
  'minecraft:stop',
  'minecraft:execute',
  'setworldspawn',
  'gamemode',
  'fill',
  'rcon',
  'bukkit:reload',
  'bukkit:stop',
];
/// Настройка (`site_settings`): дополнительные корни через запятую.
export const EXTRA_ROOTS_SETTING = 'store.delivery.extra_command_roots';
const ROOT_RE = /^[a-z0-9_-]{1,32}$/;

/// Разбор и проверка списка расширения корней. Бросает `root_forbidden` /
/// `root_invalid`.
export function normalizeRoots(input: unknown): string[] {
  const list =
    typeof input === 'string'
      ? input.split(',')
      : Array.isArray(input)
        ? input
        : [];
  const out = new Set<string>();
  for (const item of list) {
    const root = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (root === '') continue;
    if (!ROOT_RE.test(root)) {
      throw err('root_invalid', 'Корень команды: латиница, цифры, _ и -');
    }
    if (FORBIDDEN_COMMAND_ROOTS.includes(root)) {
      throw err('root_forbidden', `Корень «${root}» запрещён`);
    }
    out.add(root);
  }
  return [...out];
}

/// Белый список ФОРМ команд для корней по умолчанию (R155, Q112). Зеркало
/// `Protocol.DEFAULT_TEMPLATES` и типов аргументов плагина Bridge
/// (CommandPolicy.java): сайт НЕ шире плагина; паритет проверяет
/// command-template-plugin-parity.spec.ts (читает Protocol.java как данные).
/// Синтаксис: слова через один пробел; `a|b` — варианты литерала; `{тип}` —
/// аргумент по `COMMAND_ARG_TYPES`; суффикс `?` — необязательный хвост.
/// Корни из `extra_command_roots` форму не проверяют (как extraRoots
/// плагина); корни из DEFAULT_COMMAND_ROOTS — только по этим формам.
export const COMMAND_ARG_TYPES: Readonly<Record<string, string>> = {
  nick: '^[A-Za-z0-9_]{3,16}$',
  group: '^[A-Za-z0-9_-]{1,32}$',
  key: '^[A-Za-z0-9_-]{1,32}$',
  duration: '^([0-9]{1,4}[smhdwyM]|forever|season|once)$',
  int: '^[0-9]{1,6}$',
  qty: '^[0-9]{1,4}$',
  num: '^[0-9]{1,12}(\\.[0-9]{1,2})?$',
  item: '^[A-Za-z0-9_.-]{1,64}(:[A-Za-z0-9_.-]{1,64})?$',
};
export const DEFAULT_COMMAND_FORMS: readonly string[] = [
  'lp user {nick} parent add|addtemp {group} {duration}?',
  'luckperms user {nick} parent add|addtemp {group} {duration}?',
  'lp user {nick} parent set {group}',
  'luckperms user {nick} parent set {group}',
  'eco give {nick} {num}',
  'give {nick} {item} {qty}?',
  'crate key give {nick} {key} {qty}?',
  'cratekey key give {nick} {key} {qty}?',
  'cratekey give {nick} {key} {qty}?',
  'crate give {nick} {key} {qty}?',
];
/// Проверочный ник вместо `{username}` при разборе шаблона.
/// Сентинел: валидный ник, которого в литерале шаблона быть не должно. Слот ника
/// обязан быть ровно им (т.е. только {username}); в остальных слотах он запрещён.
const SAMPLE_NICK = 'Zq7_tplNick_9X';

interface FormRule {
  root: string;
  args: Array<(word: string, nickExact?: string) => boolean>;
  required: number;
}

function parseForm(spec: string): FormRule {
  const parts = spec.split(' ');
  const args: FormRule['args'] = [];
  let required = parts.length - 1;
  let optional = false;
  for (let i = 1; i < parts.length; i++) {
    let p = parts[i];
    const opt = p.endsWith('?');
    if (opt) p = p.slice(0, -1);
    if (opt && !optional) {
      optional = true;
      required = i - 1;
    }
    if (p.startsWith('{') && p.endsWith('}')) {
      const type = p.slice(1, -1);
      const re = new RegExp(COMMAND_ARG_TYPES[type]);
      args.push(
        type === 'nick'
          ? (w, nickExact) =>
              re.test(w) &&
              w.toLowerCase() !== 'all' &&
              (nickExact === undefined || w === nickExact)
          : (w, nickExact) =>
              re.test(w) && (nickExact === undefined || !w.includes(nickExact)),
      );
    } else {
      const alts = new Set(p.split('|').map((a) => a.toLowerCase()));
      args.push((w) => alts.has(w.toLowerCase()));
    }
  }
  return { root: parts[0], args, required };
}

const FORM_RULES: readonly FormRule[] = DEFAULT_COMMAND_FORMS.map(parseForm);

/// Команда (слова через ОДИН пробел) подходит хотя бы одной форме своего
/// корня. `nickExact`: слот ника обязан содержать именно это значение.
function matchesDefaultForm(command: string, nickExact?: string): boolean {
  const words = command.split(' ');
  const root = words[0].toLowerCase();
  return FORM_RULES.some((rule) => {
    if (rule.root !== root) return false;
    const n = words.length - 1;
    if (n < rule.required || n > rule.args.length) return false;
    for (let i = 0; i < n; i++) {
      if (!rule.args[i](words[i + 1], nickExact)) return false;
    }
    return true;
  });
}

const LITERAL_RE = /^[A-Za-z0-9_ .:,+-]*$/;
const VARIABLE_RE = /\{([^{}]*)\}/g;

export type TemplateErrorCode =
  | 'template_empty'
  | 'template_too_long'
  | 'template_control_chars'
  | 'template_forbidden_chars'
  | 'template_unknown_variable'
  | 'template_username_required'
  | 'template_too_many_variables'
  | 'template_leading_slash'
  | 'invalid_nick'
  | 'invalid_duration'
  | 'rendered_too_long'
  | 'root_not_allowed'
  | 'template_form_not_allowed'
  | 'root_forbidden'
  | 'root_invalid';

export class CommandTemplateError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CommandTemplateError';
  }
}

const err = (code: TemplateErrorCode, message: string) =>
  new CommandTemplateError(code, message);

/// Проверяет шаблон и возвращает его нормализованный вид (без внешних
/// пробелов). Бросает `CommandTemplateError`.
export function validateTemplate(
  raw: unknown,
  extraRoots: readonly string[] = [],
): string {
  if (typeof raw !== 'string') {
    throw err('template_empty', 'Шаблон должен быть строкой');
  }
  // Управляющие символы и переводы строк проверяются ДО trim.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(raw)) {
    throw err(
      'template_control_chars',
      'Шаблон не может содержать управляющие символы и переводы строк',
    );
  }
  // Нормализации нет сознательно: всё вне печатного ASCII (NBSP, нулевой
  // ширины, омоглифы, NFKC-формы, полноширинные знаки) отклоняется до trim.
  if (/[^ -~]/.test(raw)) {
    throw err(
      'template_forbidden_chars',
      'Шаблон содержит недопустимые символы (только печатный ASCII)',
    );
  }
  const template = raw.trim();
  if (template.length === 0) {
    throw err('template_empty', 'Шаблон не может быть пустым');
  }
  if (template.length > TEMPLATE_MAX_LENGTH) {
    throw err(
      'template_too_long',
      `Шаблон длиннее ${TEMPLATE_MAX_LENGTH} символов`,
    );
  }
  if (template.startsWith('/')) {
    throw err('template_leading_slash', 'Шаблон не должен начинаться с «/»');
  }
  const root = template.split(' ')[0].toLowerCase();
  if (FORBIDDEN_COMMAND_ROOTS.includes(root)) {
    throw err('root_forbidden', `Команда «${root}» запрещена`);
  }
  if (!DEFAULT_COMMAND_ROOTS.includes(root) && !extraRoots.includes(root)) {
    throw err('root_not_allowed', `Команда «${root}» не в белом списке`);
  }
  const counts: Record<string, number> = {};
  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1];
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      throw err(
        'template_unknown_variable',
        `Неизвестная переменная {${name}}; разрешены {username} и {duration}`,
      );
    }
    counts[name] = (counts[name] ?? 0) + 1;
    if (counts[name] > MAX_VARIABLE_USES) {
      throw err(
        'template_too_many_variables',
        `Переменная {${name}} используется более ${MAX_VARIABLE_USES} раз`,
      );
    }
  }
  const literal = template.replace(VARIABLE_RE, '');
  if (!LITERAL_RE.test(literal)) {
    throw err(
      'template_forbidden_chars',
      'Шаблон содержит недопустимые символы (разрешены латиница, цифры, пробел и _ - . : , +)',
    );
  }
  if (!counts.username) {
    throw err(
      'template_username_required',
      'Шаблон должен содержать переменную {username}',
    );
  }
  if (DEFAULT_COMMAND_ROOTS.includes(root)) {
    // Форма проверяется для КАЖДОГО срока из перечня: {duration} может
    // оказаться только там, где плагин принимает срок.
    for (const token of Object.values(DURATION_TOKENS)) {
      const probe = template.replace(VARIABLE_RE, (_m, name: string) =>
        name === 'username' ? SAMPLE_NICK : token,
      );
      if (!matchesDefaultForm(probe, SAMPLE_NICK)) {
        throw err(
          'template_form_not_allowed',
          'Форма команды не из белого списка (ник — только {username}, ровно один пробел между словами)',
        );
      }
    }
  }
  return template;
}

export interface TemplateValues {
  username: unknown;
  duration: unknown;
}

/// Итоговая команда. Подстановка только проверенных значений; результат
/// повторно проверяется по тому же белому списку символов.
export function renderCommand(
  template: string,
  values: TemplateValues,
  extraRoots: readonly string[] = [],
): string {
  const valid = validateTemplate(template, extraRoots);
  if (!isDeliverableNick(values.username)) {
    throw err(
      'invalid_nick',
      'Ник не подходит: 3–16 символов, латиница, цифры и _',
    );
  }
  const durationToken =
    typeof values.duration === 'string' &&
    Object.prototype.hasOwnProperty.call(DURATION_TOKENS, values.duration)
      ? DURATION_TOKENS[values.duration]
      : null;
  if (!durationToken) {
    throw err('invalid_duration', 'Срок не из перечня вариантов');
  }
  const username = values.username;
  const rendered = valid.replace(VARIABLE_RE, (_m, name: string) =>
    name === 'username' ? username : durationToken,
  );
  if (rendered.length > RENDERED_COMMAND_MAX_LENGTH) {
    throw err('rendered_too_long', 'Итоговая команда слишком длинная');
  }
  if (!LITERAL_RE.test(rendered)) {
    // Невозможно при корректных значениях; страховка.
    throw err(
      'template_forbidden_chars',
      'Итоговая команда не прошла проверку',
    );
  }
  // Итог проверяется как готовая команда (форма по белому списку плагина).
  return validateRenderedCommand(rendered, extraRoots);
}

/// Проверка УЖЕ готовой команды (без переменных) перед отправкой на сервер
/// (0.13): тот же белый список корней и символов, что у шаблона. Страховка на
/// случай подмены строки в БД: исполнитель и выдача плагину принимают только
/// команду, прошедшую эту проверку. Бросает `CommandTemplateError`.
export function validateRenderedCommand(
  raw: unknown,
  extraRoots: readonly string[] = [],
): string {
  if (typeof raw !== 'string') {
    throw err('template_empty', 'Команда должна быть строкой');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(raw)) {
    throw err('template_control_chars', 'Управляющие символы запрещены');
  }
  const command = raw.trim();
  if (command.length === 0) {
    throw err('template_empty', 'Команда пуста');
  }
  if (command !== raw) {
    throw err('template_forbidden_chars', 'Внешние пробелы запрещены');
  }
  if (command.length > RENDERED_COMMAND_MAX_LENGTH) {
    throw err('rendered_too_long', 'Команда слишком длинная');
  }
  if (command.startsWith('/')) {
    throw err('template_leading_slash', 'Команда не должна начинаться с «/»');
  }
  const root = command.split(' ')[0].toLowerCase();
  if (FORBIDDEN_COMMAND_ROOTS.includes(root)) {
    throw err('root_forbidden', `Команда «${root}» запрещена`);
  }
  if (!DEFAULT_COMMAND_ROOTS.includes(root) && !extraRoots.includes(root)) {
    throw err('root_not_allowed', `Команда «${root}» не в белом списке`);
  }
  // Фигурные скобки не входят в LITERAL_RE: неподставленная переменная
  // и любая «лишняя» конструкция отклоняются.
  if (!LITERAL_RE.test(command)) {
    throw err(
      'template_forbidden_chars',
      'Команда не прошла проверку символов',
    );
  }
  if (DEFAULT_COMMAND_ROOTS.includes(root) && !matchesDefaultForm(command)) {
    throw err('template_form_not_allowed', 'Форма команды не из белого списка');
  }
  return command;
}
