/// Централизованная классификация ссылок: куда можно переходить без
/// подтверждения, а где показать External Link Modal. Единственный
/// allowlist доверенных доменов проекта — здесь.

const TRUSTED_HOSTS = new Set(['twomc.su', 'localhost', '127.0.0.1']);
/// Поддомены twomc.su (cdn-files, status, api…) — тоже доверенные.
const TRUSTED_SUFFIXES = ['.twomc.su', '.localhost'];

export type LinkKind =
  /// Относительный путь, тот же origin или hash — обычная навигация.
  | 'internal'
  /// Абсолютная ссылка на домен проекта (allowlist).
  | 'trusted'
  /// mailto:, tel:, sms: и т.п. — подтверждение не нужно.
  | 'special'
  /// Сторонний сайт — показать подтверждение.
  | 'external'
  /// javascript:, data:, битый URL — никогда не открывать.
  | 'blocked';

export function isTrustedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (TRUSTED_HOSTS.has(host)) {
    return true;
  }
  return TRUSTED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function classifyLink(href: string | null | undefined, currentOrigin?: string): LinkKind {
  if (!href) {
    return 'internal';
  }
  const value = href.trim();
  if (value === '' || value.startsWith('#') || value.startsWith('/') || value.startsWith('?')) {
    return value.startsWith('//') ? classifyAbsolute(`https:${value}`, currentOrigin) : 'internal';
  }
  if (/^(mailto|tel|sms|callto):/i.test(value)) {
    return 'special';
  }
  if (/^(javascript|data|vbscript|blob|file):/i.test(value)) {
    return 'blocked';
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    // Относительный путь без ведущего слеша (./page, page).
    return 'internal';
  }
  return classifyAbsolute(value, currentOrigin);
}

function classifyAbsolute(value: string, currentOrigin?: string): LinkKind {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'blocked';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'blocked';
  }
  const origin =
    currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (origin && url.origin === origin) {
    return 'internal';
  }
  return isTrustedHost(url.hostname) ? 'trusted' : 'external';
}

export function isTrustedUrl(href: string | null | undefined, currentOrigin?: string): boolean {
  const kind = classifyLink(href, currentOrigin);
  return kind === 'internal' || kind === 'trusted' || kind === 'special';
}

/// Компактное представление URL для модалки: хост отдельно, полный адрес
/// усечён до разумной длины (без query-мусора в сотни символов).
export function describeExternalUrl(href: string): { hostname: string; display: string } {
  const url = new URL(href);
  const full = url.toString();
  const display = full.length > 96 ? `${full.slice(0, 93)}…` : full;
  return { hostname: url.hostname, display };
}
