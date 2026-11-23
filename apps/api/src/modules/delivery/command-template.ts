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
  return rendered;
}
