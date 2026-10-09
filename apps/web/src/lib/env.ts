/// Публичные переменные окружения frontend. Только `NEXT_PUBLIC_*` — они
/// инлайнятся в бандл на этапе сборки, секретов здесь быть не может.
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const API_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);

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
