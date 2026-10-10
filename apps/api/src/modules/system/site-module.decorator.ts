import { SetMetadata } from '@nestjs/common';

export const SITE_MODULE_KEY = 'siteModule';

/// Контроллер (или метод) относится к модулю сайта `key` из реестра
/// (`site-modules.registry.ts`, ADR-0082): при выключенном модуле или
/// техработах `SiteModuleGuard` отвечает 503. Админские контроллеры не
/// помечаются — управлять выключенным модулем можно всегда.
export const SiteModule = (key: string): ReturnType<typeof SetMetadata> =>
  SetMetadata(SITE_MODULE_KEY, key);

/// Исключение для метода внутри помеченного контроллера (например, вебхук
/// сайта голосования: внешние события не должны теряться во время техработ).
export const SkipSiteModule = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SITE_MODULE_KEY, null);
