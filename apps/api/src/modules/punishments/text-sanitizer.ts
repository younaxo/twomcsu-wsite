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
/// ОЧИСТКА ЭВРИСТИЧЕСКАЯ, не гарантия. Принятые остаточные риски (RISKS.md):
/// контакты словами (`user at example dot com`, «собака», «точка» без
/// скобок), полные названия платформ без разделителя и признаков
/// идентификатора (`discord user`), IPv4 в десятичной/шестнадцатеричной
/// записи (`0x7f.0.0.1`, `2130706433`), телефоны из 7–9 цифр без «+»,
/// гомоглифы (кириллица вместо латиницы), домены с редкой зоной после точки
/// без пробела и контакты вне списка платформ не распознаются.
/// Публичный вывод причины с маскировкой — через `publicReason` (до ответа
/// на Q59 причина с любой маскировкой скрывается целиком).

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
const DOT_LOOKALIKES = /[。｡·∙⋅・۔܁‧։⸱⸳･ꓸ᛫᛬።᙮﹒․]/g;

/// Символы-«точки», которые бывают и маркерами списков: заменяются на точку
/// только между буквой/цифрой с обеих сторон (пробелы допускаются).
const BULLET_DOTS =
  /(?<=[\p{L}\p{N}][^\S\n]{0,3})[•●◦∘⚫⦁▪‣⁃∙·](?=[^\S\n]{0,3}[\p{L}\p{N}])/gu;

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

/// Зоны, которые распознаются только БЕЗ пробелов вокруг точки (со
/// словами-зонами «hacking. Today» дало бы ложные срабатывания).
const EXTRA_BASE = [
  'moe',
  'lol',
  'page',
  'zip',
  'mov',
  'gay',
  'art',
  'blog',
  'news',
  'email',
  'chat',
  'team',
  'zone',
  'life',
  'today',
  'network',
  'media',
  'group',
  'agency',
  'digital',
  'studio',
  'design',
  'wiki',
  'fans',
  'rocks',
  'ninja',
  'host',
  'press',
  'stream',
  'download',
  'click',
  'bot',
  'wtf',
  'lat',
  'xxx',
  'porn',
  'sex',
  'casino',
  'bet',
  'poker',
  'win',
  'bid',
  'trade',
  'party',
  'review',
  'science',
  'loan',
  'men',
  'date',
  'racing',
  'faith',
  'cam',
  'monster',
  'quest',
  'sbs',
  'cyou',
  'cfd',
  'rest',
  'bar',
  'buzz',
  'center',
  'city',
  'codes',
  'community',
  'company',
  'computer',
  'direct',
  'expert',
  'gallery',
  'guru',
  'house',
  'land',
  'plus',
  'systems',
  'tools',
  'video',
  'wang',
  'works',
  'ovh',
  'dog',
  'cat',
];

/// Кириллические зоны и длинные gTLD: только без пробелов вокруг точки.
const LONG_TLDS = [
  'москва',
  'онлайн',
  'сайт',
  'орг',
  'ком',
  'дети',
  'рус',
  'бел',
  'укр',
  'срб',
  'католик',
  'мкд',
  'бг',
  'мон',
  'татар',
  'museum',
  'tokyo',
  'london',
  'berlin',
  'paris',
  'moscow',
  'nyc',
  'amsterdam',
  'vegas',
  'miami',
  'africa',
  'asia',
  'academy',
  'accountant',
  'accountants',
  'actor',
  'adult',
  'aero',
  'airforce',
  'apartments',
  'associates',
  'auction',
  'audio',
  'auto',
  'band',
  'bank',
  'bargains',
  'beer',
  'best',
  'bike',
  'bio',
  'black',
  'blue',
  'boutique',
  'build',
  'business',
  'cab',
  'cafe',
  'camera',
  'camp',
  'capital',
  'cards',
  'care',
  'career',
  'careers',
  'cash',
  'catering',
  'charity',
  'cheap',
  'christmas',
  'church',
  'claims',
  'cleaning',
  'clinic',
  'clothing',
  'coach',
  'coffee',
  'college',
  'construction',
  'consulting',
  'contractors',
  'cool',
  'coupons',
  'credit',
  'cruises',
  'dance',
  'dating',
  'deals',
  'degree',
  'delivery',
  'democrat',
  'dental',
  'diamonds',
  'directory',
  'discount',
  'doctor',
  'domains',
  'earth',
  'education',
  'energy',
  'engineer',
  'engineering',
  'enterprises',
  'equipment',
  'estate',
  'events',
  'exchange',
  'exposed',
  'express',
  'fail',
  'farm',
  'fashion',
  'film',
  'finance',
  'financial',
  'fish',
  'fishing',
  'fit',
  'fitness',
  'flights',
  'florist',
  'football',
  'forsale',
  'foundation',
  'fund',
  'furniture',
  'futbol',
  'garden',
  'gifts',
  'glass',
  'global',
  'gold',
  'golf',
  'graphics',
  'gratis',
  'green',
  'gripe',
  'guide',
  'guitars',
  'haus',
  'health',
  'healthcare',
  'help',
  'hockey',
  'holdings',
  'holiday',
  'horse',
  'hospital',
  'hosting',
  'immo',
  'industries',
  'institute',
  'insure',
  'international',
  'investments',
  'jewelry',
  'kim',
  'kitchen',
  'kiwi',
  'legal',
  'lighting',
  'limited',
  'limo',
  'loans',
  'luxury',
  'maison',
  'management',
  'market',
  'marketing',
  'mba',
  'memorial',
  'moda',
  'mortgage',
  'movie',
  'navy',
  'onl',
  'organic',
  'partners',
  'parts',
  'photo',
  'photography',
  'photos',
  'pics',
  'pictures',
  'pink',
  'pizza',
  'place',
  'plumbing',
  'productions',
  'properties',
  'pub',
  'recipes',
  'red',
  'rentals',
  'repair',
  'report',
  'republican',
  'restaurant',
  'rip',
  'run',
  'sale',
  'school',
  'schule',
  'services',
  'shoes',
  'show',
  'singles',
  'soccer',
  'social',
  'software',
  'solar',
  'solutions',
  'support',
  'surf',
  'surgery',
  'taxi',
  'technology',
  'tennis',
  'theater',
  'tips',
  'tires',
  'tours',
  'town',
  'toys',
  'training',
  'university',
  'uno',
  'vacations',
  'ventures',
  'vet',
  'viajes',
  'villas',
  'vision',
  'vodka',
  'vote',
  'voyage',
  'watch',
  'webcam',
  'wedding',
  'wien',
  'wine',
  'yoga',
];
const EXTRA_TLDS = Array.from(new Set([...EXTRA_BASE, ...LONG_TLDS])).join('|');

const URL_RE = /(?:[a-z][a-z0-9+.-]{1,15}:\/\/|www\.|mailto:)\S*/giu;
const EMAIL_RE =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\s?\.\s?[\p{L}\p{N}-]+)+/giu;
/// E-mail без доменной зоны (`user@gmail`): только без пробелов.
const EMAIL_NODOT_RE =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]{2,}/giu;
const IPV6_CANDIDATE_RE =
  /(?<![\p{L}\p{N}_])\[?(?:[0-9a-f]{0,4}:){2,7}(?:(?:\d{1,3}\.){3}\d{1,3}(?!\d)|[0-9a-f]{1,4}(?![0-9a-f])|(?<=::))(?:%[0-9a-z]+)?\]?(?::\d{1,5})?/giu;
const OCTET = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const IPV4_RE = new RegExp(
  `(?<!\\d)${OCTET}(?:\\s*\\.\\s*${OCTET}|,${OCTET}){3}(?!\\d)(?:\\s?:\\s?\\d{1,5})?(?:\\/\\d{1,2})?`,
  'g',
);
const OCT_D = '\\d(?: ?\\d){0,2}';
/// Дефисы и похожие чёрточки (en/em dash, minus и др.) в записях разделителей.
const DASHES = '\\-‐‑‒–—―−';
const IP_SEP = `(?:\\s*(?:[.${DASHES}_/]|dot|точка)\\s*|\\s+)`;
/// IPv4 с разделителями пробел, `-`, `_`, `/`, `dot`: `192 168 1 1`,
/// `192-168-0-1`, `192 dot 168 dot 0 dot 1`.
const IPV4_SEP_RE = new RegExp(
  `(?<!\\d)${OCTET}(?:${IP_SEP}${OCTET}){3}(?!\\d)`,
  'giu',
);
/// То же, но цифры внутри октета разделены пробелами: `1 9 2 . 1 6 8 . 0 . 1`.
const IPV4_SPACED_DIGITS_RE = new RegExp(
  `(?<!\\d)${OCT_D}(?:\\s*[.${DASHES}_/]\\s*${OCT_D}){3}(?!\\d)`,
  'gu',
);

/// Запись с разделителями легко совпадает с обычными числами («1 2 3 4»):
/// без точки скрываем, только если в записи не меньше 5 цифр.
function redactSeparatedIpv4(m: string): string {
  const valid = (p: string[]) =>
    p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
  let parts = m.split(/\s*(?:[.\-‐‑‒–—―−_/]|dot|точка)\s*|\s+/iu);
  if (!valid(parts)) {
    // Цифры внутри октета разделены пробелами: `1 9 2 . 1 6 8 . 0 . 1`.
    parts = m.split(/\s*[.\-‐‑‒–—―−_/]\s*/u).map((p) => p.replace(/\s+/g, ''));
  }
  if (!valid(parts)) return m;
  const hasDot = /\./.test(m) || /dot|точка/iu.test(m);
  return hasDot || parts.join('').length >= 5 ? REDACTED : m;
}

/// Шаблоны LiteBans вида `127.0.0.%` и маски `10.0.*`.
const IPV4_WILDCARD_RE = /(?<!\d)(?:\d{1,3}\s*\.\s*){1,3}[%*]/g;
const CONTACT_LABELS =
  'discord|disc|ds|дискорд|дс|telegram|tg|телеграм|телеграмм|тг|телега|vk|вк|вконтакте|skype|скайп|whatsapp|wa|ватсап|вацап|viber|вайбер|instagram|inst|инст|инстаграм|snapchat|snap|ig|insta|tiktok|тикток|icq|phone|телефон|тел|email|e-mail|почта|contacts?|контакты?';
/// Слова-пояснения между меткой и идентификатором: `vk id 12345`.
const CONTACT_FILLERS =
  'id|ид|айди|nick|nickname|ник|никнейм|name|user|username|юзер|acc|account|акк|аккаунт';
/// Короткие коды платформ: после них скрывается любое следующее слово
/// (`ds user`, `add me tg vasya`); у полных названий слово без признаков
/// идентификатора остаётся («спам про discord в чате»).
const SHORT_LABELS = 'ds|дс|tg|тг|vk|вк|ig|wa|snap|insta';
/// Метка платформы с разделителем (`:`, `=`, `-`, `@`) и идентификатором.
const CONTACT_SEP_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CONTACT_LABELS})(?:\\s+(?:${CONTACT_FILLERS}))?\\s*[:=\\-–—@]+\\s*[^\\s,;]{2,64}`,
  'giu',
);
/// Метка платформы, пробел и токен, похожий на идентификатор (цифра, `_`,
/// `.`, `@`, `#`).
const CONTACT_SPACE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CONTACT_LABELS})(?:\\s+(?:${CONTACT_FILLERS}))?\\s+(?=[^\\s]*[@#\\d_.])[^\\s,;]{2,64}`,
  'giu',
);
/// Метка, слово-пояснение и любой идентификатор: `дискорд ник вася`.
const CONTACT_FILLER_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CONTACT_LABELS})\\s+(?:${CONTACT_FILLERS})\\s*[:=\\-]?\\s*[^\\s,;]{2,64}`,
  'giu',
);
/// Короткий код платформы и любое следующее слово; не после цифры
/// («5000 тг штраф» не трогается).
const CONTACT_SHORT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?<!\\d\\s?)(?:${SHORT_LABELS})[^\\S\\n]+[^\\s,;]{2,64}`,
  'giu',
);
/// Старый тег Discord `name#1234`.
const DISCORD_TAG_RE = /(?<![\p{L}\p{N}_.])[\p{L}\p{N}_.]{2,32}#\d{4}(?!\d)/gu;
/// Путь после домена, в том числе с пробелами вокруг `/`: `t . me / user`.
const URL_PATH = '(?:[^\\S\\n]{0,2}\\/[^\\S\\n]{0,2}\\S*)*';
const DOMAIN_RE = new RegExp(
  `(?<![\\p{L}\\p{N}@])(?:[\\p{L}\\p{N}-]+\\s?\\.\\s?)+(?:${TLDS})(?![\\p{L}\\p{N}])(?::\\d{1,5})?${URL_PATH}`,
  'giu',
);
/// Любая двухбуквенная ccTLD, punycode `xn--...` и расширенный список gTLD —
/// только без пробелов вокруг точки.
const DOMAIN_TIGHT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}@])(?:[\\p{L}\\p{N}-]+\\.)+(?:xn--[a-z0-9-]+|[a-z]{2}|${EXTRA_TLDS})(?![\\p{L}\\p{N}-])(?::\\d{1,5})?${URL_PATH}`,
  'giu',
);
/// Доменная зона с ведущей точкой без имени (`.tokyo`, `.рф`).
const DOT_TLD_RE = new RegExp(
  `(?<![\\p{L}\\p{N}.])\\.(?:${TLDS}|${EXTRA_TLDS})(?![\\p{L}\\p{N}-])`,
  'giu',
);
const HANDLE_RE = /(?<![\p{L}\p{N}_])@[\p{L}\p{N}_.]{2,}/gu;
/// Телефон: цифры с разделителями пробел, `.`, `-`, `/`, `_`, скобки и
/// чёрточки Юникода (`8/999/123/45/67`, `8–999–123–45–67`).
const PHONE_RE = /(?<![\p{L}\p{N}_])\+?\(?\d[\d\s().\-‐‑‒–—―−/_]{5,}\d/gu;

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
  out = out.replace(EMAIL_NODOT_RE, REDACTED);
  out = out.replace(IPV6_CANDIDATE_RE, (m) =>
    looksLikeIpv6(m) ? REDACTED : m,
  );
  out = out.replace(IPV4_RE, REDACTED);
  out = out.replace(IPV4_SPACED_DIGITS_RE, redactSeparatedIpv4);
  out = out.replace(IPV4_SEP_RE, redactSeparatedIpv4);
  out = out.replace(IPV4_WILDCARD_RE, REDACTED);
  out = out.replace(CONTACT_SEP_RE, REDACTED);
  out = out.replace(CONTACT_SPACE_RE, REDACTED);
  out = out.replace(CONTACT_FILLER_RE, REDACTED);
  out = out.replace(CONTACT_SHORT_RE, REDACTED);
  out = out.replace(DISCORD_TAG_RE, REDACTED);
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, '').length;
    return digits >= 10 || (m.trimStart().startsWith('+') && digits >= 7)
      ? REDACTED
      : m;
  });
  out = out.replace(DOMAIN_RE, REDACTED);
  out = out.replace(DOMAIN_TIGHT_RE, REDACTED);
  out = out.replace(DOT_TLD_RE, REDACTED);
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

/// Результат очистки: текст и признак, что часть текста скрыта.
export interface SanitizeResult {
  text: string | null;
  /// true, если что-либо скрыто (в том числе в части, отсечённой обрезкой).
  masked: boolean;
}

/// Хвост, оставшийся от маркера `[скрыто]`, рассечённого обрезкой.
const PARTIAL_MASK_TAIL = /\[(?:с(?:к(?:р(?:ы(?:т(?:о)?)?)?)?)?)?$/u;

/// Обрезка после очистки с повторной проверкой хвоста: обрезанный
/// посередине фрагмент мог стать адресом (`1.2.3.4567` -> `1.2.3.45`), а
/// маркер скрытия — потерять конец. Замена на `[скрыто]` может удлинить
/// текст, поэтому цикл повторяется, пока результат не стабилен.
function truncateSafely(s: string, max: number): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    out = truncateCodePoints(out.trim(), max).replace(PARTIAL_MASK_TAIL, '');
    const checked = redactContacts(out);
    if (checked === out) return out.trim();
    out = checked;
  }
  return truncateCodePoints(out.trim(), max)
    .replace(PARTIAL_MASK_TAIL, '')
    .trim();
}

/// Очистка с признаком маскировки. Разбор и правила — в `sanitizeText`.
export function sanitizeTextDetailed(
  raw: string | null | undefined,
  options: SanitizeOptions,
): SanitizeResult {
  if (raw === null || raw === undefined) return { text: null, masked: false };
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
  s = s.replace(BULLET_DOTS, '.');
  for (const pattern of COLOR_PATTERNS) s = s.replace(pattern, '');
  s = deobfuscate(s);
  s = redactContacts(s);
  const masked = s.includes(REDACTED);

  if (options.multiline) {
    s = s
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/gu, ' ');
  }
  s = truncateSafely(s, options.maxLength);
  return {
    text: s.length === 0 ? null : s,
    masked: masked || s.includes(REDACTED),
  };
}

/// Общий конвейер: обрезка входа, NFKC, цифры в ASCII, «точки», невидимые
/// и bidi-символы, цветовые коды, обходные записи, скрытие контактов,
/// пробелы, обрезка до `maxLength` (после скрытия, затем повторная проверка
/// хвоста: контакт не обрезается посередине и не остаётся «хвостом»).
export function sanitizeText(
  raw: string | null | undefined,
  options: SanitizeOptions,
): string | null {
  return sanitizeTextDetailed(raw, options).text;
}

/// Очищенная причина с признаком маскировки (`masked`).
export function sanitizeReasonDetailed(
  raw: string | null | undefined,
): SanitizeResult {
  return sanitizeTextDetailed(raw, {
    maxLength: MAX_REASON_LENGTH,
    multiline: true,
  });
}

/// Нужна ли маскировка: в уже очищенном (сохранённом) тексте есть маркер.
export function isReasonMasked(sanitized: string | null | undefined): boolean {
  return typeof sanitized === 'string' && sanitized.includes(REDACTED);
}

/// Допущение до ответа владельца на Q59: причина с любой маскировкой в
/// публичном выводе скрывается ЦЕЛИКОМ (возвращает null). Публичного вывода
/// пока нет (срез 2); функцию вызывать на публичном пути.
export function publicReason(
  sanitized: string | null | undefined,
): string | null {
  if (sanitized === null || sanitized === undefined) return null;
  return isReasonMasked(sanitized) ? null : sanitized;
}

/// Причина наказания и причина снятия: до 2048, переводы строк сохраняются.
export function sanitizeReason(raw: string | null | undefined): string | null {
  return sanitizeText(raw, { maxLength: MAX_REASON_LENGTH, multiline: true });
}

/// Ник, имя выдавшего, область, сервер: одна строка до 128.
export function sanitizeLabel(raw: string | null | undefined): string | null {
  return sanitizeText(raw, { maxLength: MAX_LABEL_LENGTH, multiline: false });
}
