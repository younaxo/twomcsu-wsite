import { isIPv6 } from 'net';

/// Очистка текстов из источника наказаний перед сохранением в зеркало и
/// показом (ADR-0166, разделы 3.1 и 6; решение владельца Q31).
///
/// ИНВАРИАНТ: IP-адреса и контактные данные (e-mail, телефоны, URL, домены,
/// Discord/Telegram и подобные идентификаторы) не должны пережить очистку
/// никогда: модераторы пишут их в причинах. При сомнении фрагмент скрывается
/// (возможны ложные срабатывания, это сознательный выбор fail-closed).
/// Результат выводить только как plain text, без автоссылок.
///
/// Известные границы (см. RISKS.md): IPv4 в десятичной/шестнадцатеричной
/// записи, контакты словами («собака», «точка» без скобок), гомоглифы
/// (кириллица вместо латиницы) и контакты вне списка платформ не распознаются.

export const MAX_REASON_LENGTH = 2048;
export const MAX_LABEL_LENGTH = 128;
export const REDACTED = '[скрыто]';

/// Вход обрезается до этой длины до обработки (защита от дорогих разборов).
const MAX_INPUT_LENGTH = 4096;

const NEWLINES = /\r\n?|[\u2028\u2029\u0085]/g;

/// Управляющие, невидимые и bidi-символы: C0 и C1 (кроме \n), мягкий перенос,
/// заполнители Hangul, mongolian vowel separator, zero-width, LRM/RLM,
/// bidi-встраивания U+202A–202E и изоляты U+2066–2069, word joiner и
/// «невидимые операторы», BOM, interlinear annotation, селекторы вариантов.
const INVISIBLE =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]|[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

/// Комбинирующие знаки после небуквы (между цифрами и знаками препинания они
/// ломают распознавание адресов).
const MARKS_AFTER_NON_LETTER = /(?<!\p{L})\p{M}+/gu;

/// Юникод-«точки», которых нет в NFKC-свёртке.
const DOT_LOOKALIKES = /[。｡·∙⋅・۔܁]/g;

const COLOR_PATTERNS: RegExp[] = [
  /[&§]x(?:[&§][0-9a-f]){6}/gi,
  /&#[0-9a-f]{6}/gi,
  /[<{]#[0-9a-f]{6}[>}]/gi,
  /[&§][0-9a-fk-orx]/gi,
  /§/g,
];

const ASCII_DIGIT = /^[0-9]$/;
const ANY_DIGIT = /^\p{Nd}$/u;
const DIGIT_CACHE = new Map<number, number>();

function digitValue(ch: string): number {
  const cp = ch.codePointAt(0) as number;
  const cached = DIGIT_CACHE.get(cp);
  if (cached !== undefined) return cached;
  // Десятичные цифры идут сериями по 10 подряд; значение — позиция в серии.
  let start = cp;
  while (ANY_DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  const value = (cp - start) % 10;
  DIGIT_CACHE.set(cp, value);
  return value;
}

/// Цифры любых письменностей (арабо-индийские, деванагари и т. д.) в ASCII.
function toAsciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (ch) =>
    ASCII_DIGIT.test(ch) ? ch : String(digitValue(ch)),
  );
}

/// Обходные записи точки и собаки в скобках: `[.]`, `(dot)`, `{точка}`, `[at]`.
function deobfuscate(s: string): string {
  return s
    .replace(/[[({<]\s*(?:\.|dot|точка|тчк)\s*[\])}>]/giu, '.')
    .replace(/[[({<]\s*(?:@|at|собака)\s*[\])}>]/giu, '@');
}

const TLDS = [
  'com',
  'net',
  'org',
  'info',
  'biz',
  'edu',
  'gov',
  'int',
  'ru',
  'su',
  'рф',
  'ua',
  'by',
  'kz',
  'uz',
  'md',
  'pl',
  'de',
  'fr',
  'uk',
  'us',
  'eu',
  'es',
  'it',
  'nl',
  'cz',
  'lv',
  'lt',
  'ee',
  'tr',
  'cn',
  'jp',
  'kr',
  'in',
  'br',
  'ca',
  'au',
  'io',
  'gg',
  'me',
  'tv',
  'cc',
  'ws',
  'to',
  'ly',
  'co',
  'xyz',
  'top',
  'pro',
  'app',
  'dev',
  'site',
  'online',
  'club',
  'live',
  'link',
  'fun',
  'shop',
  'store',
  'tech',
  'cloud',
  'website',
  'space',
  'ink',
  'gl',
  'be',
  'sh',
  'ai',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'vip',
  'mobi',
  'name',
  'gift',
  'world',
  'games',
  'game',
  'one',
  'pw',
  'icu',
  'ltd',
  'work',
  'ng',
  'onion',
].join('|');

const URL_RE = /(?:[a-z][a-z0-9+.-]{1,15}:\/\/|www\.|mailto:)\S*/giu;
const EMAIL_RE =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\s?\.\s?[\p{L}\p{N}-]+)+/giu;
const IPV6_CANDIDATE_RE =
  /(?<![\p{L}\p{N}_])\[?(?:[0-9a-f]{0,4}:){2,7}(?:[0-9a-f]{1,4}|(?:\d{1,3}\.){3}\d{1,3})?(?:%[0-9a-z]+)?\]?(?::\d{1,5})?/giu;
const OCTET = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const IPV4_RE = new RegExp(
  `(?<!\\d)${OCTET}(?:\\s*\\.\\s*${OCTET}|,${OCTET}){3}(?!\\d)(?:\\s?:\\s?\\d{1,5})?(?:\\/\\d{1,2})?`,
  'g',
);
/// Шаблоны LiteBans вида `127.0.0.%` и маски `10.0.*`.
const IPV4_WILDCARD_RE = /(?<!\d)(?:\d{1,3}\s*\.\s*){1,3}[%*]/g;
const CONTACT_LABELS =
  'discord|disc|ds|дискорд|дс|telegram|tg|телеграм|телеграмм|тг|телега|vk|вк|вконтакте|skype|скайп|whatsapp|wa|ватсап|вацап|viber|вайбер|instagram|inst|инст|инстаграм|snapchat|tiktok|тикток|icq|phone|телефон|тел|email|e-mail|почта|contacts?|контакты?';
/// Метка платформы с разделителем (`:`, `=`, `-`, `@`) и идентификатором.
const CONTACT_SEP_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CONTACT_LABELS})\\s*[:=\\-–—@]+\\s*[^\\s,;]{2,64}`,
  'giu',
);
/// Метка платформы, пробел и токен, похожий на идентификатор (цифра, `_`,
/// `.`, `@`, `#`).
const CONTACT_SPACE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CONTACT_LABELS})\\s+(?=[^\\s]*[@#\\d_.])[^\\s,;]{2,64}`,
  'giu',
);
/// Старый тег Discord `name#1234`.
const DISCORD_TAG_RE = /(?<![\p{L}\p{N}_.])[\p{L}\p{N}_.]{2,32}#\d{4}(?!\d)/gu;
const DOMAIN_RE = new RegExp(
  `(?<![\\p{L}\\p{N}@])(?:[\\p{L}\\p{N}-]+\\s?\\.\\s?)+(?:${TLDS})(?![\\p{L}\\p{N}])(?::\\d{1,5})?(?:\\/\\S*)?`,
  'giu',
);
const HANDLE_RE = /(?<![\p{L}\p{N}_])@[\p{L}\p{N}_.]{2,}/gu;
const PHONE_RE = /(?<![\p{L}\p{N}_])\+?\(?\d[\d\s().-]{5,}\d/gu;

function looksLikeIpv6(candidate: string): boolean {
  const bracket = /^\[([^\]]*)\]/.exec(candidate);
  let body = bracket ? bracket[1] : candidate;
  body = body.replace(/%[0-9a-z]+$/i, '');
  // «::» без единой цифры — просто двоеточия в тексте.
  if (!/[0-9a-f]/i.test(body)) return false;
  if (isIPv6(body)) return true;
  if (!bracket) {
    // Адрес с портом без скобок: `...:25565`.
    const withoutPort = body.replace(/:\d{1,5}$/, '');
    if (withoutPort !== body && isIPv6(withoutPort)) return true;
  }
  // Сомнение: сжатая запись с `::` из шестнадцатеричных знаков.
  return (
    body.includes('::') && /[0-9a-f]/i.test(body) && /^[0-9a-f:.]+$/i.test(body)
  );
}

function redactContacts(s: string): string {
  let out = s;
  out = out.replace(URL_RE, REDACTED);
  out = out.replace(EMAIL_RE, REDACTED);
  out = out.replace(IPV6_CANDIDATE_RE, (m) =>
    looksLikeIpv6(m) ? REDACTED : m,
  );
  out = out.replace(IPV4_RE, REDACTED);
  out = out.replace(IPV4_WILDCARD_RE, REDACTED);
  out = out.replace(CONTACT_SEP_RE, REDACTED);
  out = out.replace(CONTACT_SPACE_RE, REDACTED);
  out = out.replace(DISCORD_TAG_RE, REDACTED);
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, '').length;
    return digits >= 10 || (m.trimStart().startsWith('+') && digits >= 7)
      ? REDACTED
      : m;
  });
  out = out.replace(DOMAIN_RE, REDACTED);
  out = out.replace(HANDLE_RE, REDACTED);
  return out;
}

function truncateCodePoints(s: string, max: number): string {
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max).join('');
}

export interface SanitizeOptions {
  maxLength: number;
  /// Сохранять переводы строк (причина) или склеивать в пробелы (имена).
  multiline: boolean;
}

/// Общий конвейер: обрезка входа, NFKC, цифры в ASCII, «точки», невидимые
/// и bidi-символы, цветовые коды, обходные записи, скрытие контактов,
/// пробелы, обрезка до `maxLength` (после скрытия: контакт не обрезается
/// посередине и не остаётся «хвостом»).
export function sanitizeText(
  raw: string | null | undefined,
  options: SanitizeOptions,
): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw);
  if (s.length > MAX_INPUT_LENGTH) {
    s = s.slice(0, MAX_INPUT_LENGTH);
    // Не оставляем оборванный посередине контакт в конце.
    const lastSpace = s.search(/\s\S*$/);
    if (lastSpace > 0) s = s.slice(0, lastSpace);
  }
  s = s.normalize('NFKC');
  s = toAsciiDigits(s);
  s = s.replace(DOT_LOOKALIKES, '.');
  s = s.replace(NEWLINES, '\n').replace(/\t/g, ' ');
  s = s.replace(INVISIBLE, '');
  s = s.replace(MARKS_AFTER_NON_LETTER, '');
  for (const pattern of COLOR_PATTERNS) s = s.replace(pattern, '');
  s = deobfuscate(s);
  s = redactContacts(s);

  if (options.multiline) {
    s = s
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/gu, ' ');
  }
  s = truncateCodePoints(s.trim(), options.maxLength).trim();
  return s.length === 0 ? null : s;
}

/// Причина наказания и причина снятия: до 2048, переводы строк сохраняются.
export function sanitizeReason(raw: string | null | undefined): string | null {
  return sanitizeText(raw, { maxLength: MAX_REASON_LENGTH, multiline: true });
}

/// Ник, имя выдавшего, область, сервер: одна строка до 128.
export function sanitizeLabel(raw: string | null | undefined): string | null {
  return sanitizeText(raw, { maxLength: MAX_LABEL_LENGTH, multiline: false });
}
