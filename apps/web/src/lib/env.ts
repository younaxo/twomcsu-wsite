/// Публичные переменные окружения frontend. Только `NEXT_PUBLIC_*` — они
/// инлайнятся в бандл на этапе сборки, секретов здесь быть не может.
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const API_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);

/// Публичный адрес сайта (ADR-0126): канонические ссылки, OG, sitemap, robots.
export const SITE_URL = stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://twomc.su');

/// Адрес основного сайта для сайта розыгрыша (GIVEAWAY_ONLY, только сервер): шапка и футер
/// ведут на него абсолютными ссылками.
export const MAIN_SITE_URL = stripTrailingSlash(process.env.MAIN_SITE_URL || 'https://twomc.su');

/// Публичный CDN статики (`cdn-files.twomc.su`). Единственное место, где
/// известен хост CDN: компоненты собирают URL через `cdnUrl()`.
export const CDN_BASE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_CDN_BASE_URL ?? 'https://cdn-files.twomc.su',
);

/// Абсолютный URL файла на CDN по относительному пути (`minecraft/…/owner.png`).
/// Путь приходит только из trusted-конфига/контракта, не от пользователя.
export function cdnUrl(relativePath: string): string {
  return `${CDN_BASE_URL}/${relativePath.replace(/^\/+/, '')}`;
}

/// Публичный site key Cloudflare Turnstile (dev — тестовый ключ Cloudflare,
/// который всегда проходит). Пустой ключ → виджет не рендерится, а форма
/// честно сообщает, что защита не настроена.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

/// Флаги «ассет уже лежит на CDN». Пока файла на CDN нет (владелец загрузит
/// позже, см. docs/runbooks/cdn.md, «Отсутствующие ассеты»), по умолчанию
/// используется локальный ассет/текстовый бейдж и лишних запросов в 404 нет.
/// Читаются в момент вызова (а не при загрузке модуля) — так их можно
/// переопределять в тестах; в бандл значение всё равно инлайнится при сборке.
export function isRubyIconOnCdn(): boolean {
  return process.env.NEXT_PUBLIC_RUBY_ICON_ON_CDN === 'true';
}

export function arePrefixImagesOnCdn(): boolean {
  return process.env.NEXT_PUBLIC_PREFIX_IMAGES_ON_CDN === 'true';
}
