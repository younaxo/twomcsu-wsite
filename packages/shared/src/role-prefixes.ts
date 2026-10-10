/// Графические префиксы ролей TwoMC — официальные PNG из Minecraft
/// resource pack, отдаются с CDN (`<CDN_BASE_URL>/minecraft/resourspack/
/// prefixes/<slug>.png`). Ключ — стабильный `Role.slug` (как в seed:
/// `owner`, `chief-curator`, `chief-developer`), НЕ displayName.
///
/// Это только визуальное отображение роли. Permissions определяются
/// исключительно RBAC на backend (PermissionService / `GET /auth/me`);
/// наличие PNG ничего не говорит о правах.
///
/// Размеры измерены по реальным файлам (2026-10-08): все полоски высотой
/// 7px, pixel-art, ширина разная — хранится здесь, чтобы `<img>` получал
/// явные width/height (layout stability) и масштабировался целочисленно.

export const ROLE_PREFIX_PATH = 'minecraft/resourspack/prefixes';
export const ROLE_PREFIX_HEIGHT = 7;

export interface RolePrefixDefinition {
  /// `Role.slug` в backend — единственный технический идентификатор.
  slug: string;
  /// Человекочитаемое имя роли (совпадает с `Role.name`/`displayName` в seed).
  name: string;
  /// Ширина оригинального PNG в пикселях (высота всегда ROLE_PREFIX_HEIGHT).
  width: number;
}

export const ROLE_PREFIXES = [
  { slug: 'owner', name: 'Owner', width: 37 },
  { slug: 'chief-curator', name: 'Chief Curator', width: 89 },
  { slug: 'senior-curator', name: 'Senior Curator', width: 96 },
  { slug: 'chief-developer', name: 'Chief Developer', width: 103 },
  { slug: 'curator', name: 'Curator', width: 51 },
  { slug: 'head-pr-manager', name: 'Head PR Manager', width: 103 },
  { slug: 'chief-technical-administrator', name: 'Chief Technical Administrator', width: 106 },
  { slug: 'project-team', name: 'Project Team', width: 84 },
  { slug: 'head-developer', name: 'Head Developer', width: 98 },
  { slug: 'special-administrator', name: 'Special Administrator', width: 87 },
  { slug: 'developer', name: 'Developer', width: 65 },
  { slug: 'chief-administrator', name: 'Chief Administrator', width: 73 },
  { slug: 'pr-manager', name: 'PR Manager', width: 70 },
  { slug: 'technical-administrator', name: 'Technical Administrator', width: 68 },
  { slug: 'head-cheat-hunter', name: 'Head Cheat Hunter', width: 117 },
  { slug: 'senior-administrator', name: 'Senior Administrator', width: 80 },
  { slug: 'head-pr-assistant', name: 'Head PR Assistant', width: 115 },
  { slug: 'administrator', name: 'Administrator', width: 35 },
  { slug: 'junior-administrator', name: 'Junior Administrator', width: 80 },
  { slug: 'cheat-hunter', name: 'Cheat Hunter', width: 84 },
  { slug: 'chief-moderator', name: 'Chief Moderator', width: 75 },
  { slug: 'senior-moderator', name: 'Senior Moderator', width: 82 },
  { slug: 'pr-assistant', name: 'PR Assistant', width: 82 },
  { slug: 'moderator', name: 'Moderator', width: 37 },
  { slug: 'junior-moderator', name: 'Junior Moderator', width: 82 },
  { slug: 'chief-helper', name: 'Chief Helper', width: 82 },
  { slug: 'senior-helper', name: 'Senior Helper', width: 89 },
  { slug: 'helper', name: 'Helper', width: 44 },
  { slug: 'junior-helper', name: 'Junior Helper', width: 89 },
] as const satisfies readonly RolePrefixDefinition[];

export type RolePrefixSlug = (typeof ROLE_PREFIXES)[number]['slug'];

export const ROLE_PREFIX_BY_SLUG: Readonly<Record<string, RolePrefixDefinition>> =
  Object.fromEntries(ROLE_PREFIXES.map((p) => [p.slug, p]));

export function getRolePrefix(slug: string | null | undefined): RolePrefixDefinition | null {
  if (!slug) {
    return null;
  }
  return ROLE_PREFIX_BY_SLUG[slug] ?? null;
}

export function hasRolePrefix(slug: string | null | undefined): slug is RolePrefixSlug {
  return getRolePrefix(slug) !== null;
}

/// Относительный путь файла на CDN; абсолютный URL собирает frontend из
/// своего CDN-конфига. Клиент никогда не подставляет произвольный URL.
export function rolePrefixRelativePath(slug: string): string {
  return `${ROLE_PREFIX_PATH}/${slug}.png`;
}

// ---------------------------------------------------------------------------
// Единый реестр префиксов (ADR-0098): STAFF — роли команды (выше), MEDIA —
// медиа-партнёры, DONATION — донат-привилегии. Те же PNG 7 px из resource pack,
// каталоги на CDN — рядом со staff-префиксами. Возле ника — ОДИН префикс:
// STAFF > MEDIA > DONATION; остальные статусы — значки и награды.
//
// DONATION — пока только ассеты (asset foundation): привилегии, уровни доната
// и покупки не реализованы, выдавать донат-префикс некому.

export type PrefixCategory = 'STAFF' | 'MEDIA' | 'DONATION';

export interface PrefixDefinition {
  category: PrefixCategory;
  slug: string;
  /// Подпись (alt, тултип, текстовый fallback).
  name: string;
  /// Ширина оригинального PNG; высота всегда ROLE_PREFIX_HEIGHT.
  width: number;
}

export const PREFIX_PATHS: Readonly<Record<PrefixCategory, string>> = {
  STAFF: ROLE_PREFIX_PATH,
  MEDIA: `${ROLE_PREFIX_PATH}/media`,
  DONATION: `${ROLE_PREFIX_PATH}/donations`,
};

/// Медиа-префиксы: конкретная площадка (`MediaBadgeKind` → slug) и общий
/// `media` — когда определить одну площадку нельзя. Размеры — по файлам
/// (2026-10-10).
export const MEDIA_PREFIXES = [
  { category: 'MEDIA', slug: 'media', name: 'Медиа', width: 35 },
  { category: 'MEDIA', slug: 'youtube', name: 'YouTube', width: 51 },
  { category: 'MEDIA', slug: 'twitch', name: 'Twitch', width: 42 },
  { category: 'MEDIA', slug: 'tiktok', name: 'TikTok', width: 42 },
] as const satisfies readonly PrefixDefinition[];

/// Донат-префиксы в порядке иерархии (Dionysus → Zeus). Не путать с артами
/// магазина `minecraft/donations/<slug>.png` — это другие ассеты.
export const DONATION_PREFIXES = [
  { category: 'DONATION', slug: 'dionysus', name: 'Dionysus', width: 56 },
  { category: 'DONATION', slug: 'hermes', name: 'Hermes', width: 44 },
  { category: 'DONATION', slug: 'heracles', name: 'Heracles', width: 58 },
  { category: 'DONATION', slug: 'apollo', name: 'Apollo', width: 44 },
  { category: 'DONATION', slug: 'ares', name: 'Ares', width: 30 },
  { category: 'DONATION', slug: 'poseidon', name: 'Poseidon', width: 56 },
  { category: 'DONATION', slug: 'zeus', name: 'Zeus', width: 30 },
] as const satisfies readonly PrefixDefinition[];

export type MediaPrefixSlug = (typeof MEDIA_PREFIXES)[number]['slug'];
export type DonationPrefixSlug = (typeof DONATION_PREFIXES)[number]['slug'];

const MEDIA_BY_KIND: Readonly<Record<string, MediaPrefixSlug>> = {
  YOUTUBE: 'youtube',
  TWITCH: 'twitch',
  TIKTOK: 'tiktok',
};

export function staffPrefix(slug: string | null | undefined): PrefixDefinition | null {
  const definition = getRolePrefix(slug);
  return definition ? { category: 'STAFF', ...definition } : null;
}

/// Медиа-префикс по площадкам медиа-партнёра: одна площадка — её префикс,
/// несколько (или неизвестная) — общий «Медиа», ни одной — null.
export function mediaPrefix(kinds: readonly string[] | null | undefined): PrefixDefinition | null {
  if (!kinds?.length) return null;
  const known = [...new Set(kinds)].map((kind) => MEDIA_BY_KIND[kind]);
  const slug = known.length === 1 && known[0] ? known[0] : 'media';
  return MEDIA_PREFIXES.find((prefix) => prefix.slug === slug) ?? null;
}

export function donationPrefix(slug: string | null | undefined): PrefixDefinition | null {
  if (!slug) return null;
  return DONATION_PREFIXES.find((prefix) => prefix.slug === slug) ?? null;
}

/// Один основной префикс возле ника: STAFF > MEDIA > DONATION.
export function resolvePrimaryPrefix(input: {
  /// slug основной роли (самая старшая с префиксом — `pickPrimaryRole`).
  staffSlug?: string | null;
  mediaBadges?: readonly string[] | null;
  donationSlug?: string | null;
}): PrefixDefinition | null {
  return (
    staffPrefix(input.staffSlug) ??
    mediaPrefix(input.mediaBadges) ??
    donationPrefix(input.donationSlug)
  );
}

export function prefixRelativePath(prefix: Pick<PrefixDefinition, 'category' | 'slug'>): string {
  return `${PREFIX_PATHS[prefix.category]}/${prefix.slug}.png`;
}
