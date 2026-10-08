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
