/// Единственные роли с wildcard-доступом (ADR-0004/ADR-0005). Остальные
/// staff-роли (Admin/Moderator/Helper-эквиваленты) создаются в PHASE 32
/// вместе с bootstrap-аккаунтами — для них уже должны существовать реальные
/// permissions доменных модулей, которых пока нет.
export interface SuperuserRoleDefinition {
  name: string;
  slug: string;
  displayName: string;
  priority: number;
}

export const SUPERUSER_ROLES: SuperuserRoleDefinition[] = [
  { name: 'Owner', slug: 'owner', displayName: 'Owner', priority: 1000 },
  { name: 'Chief Curator', slug: 'chief-curator', displayName: 'Chief Curator', priority: 900 },
  { name: 'Chief Developer', slug: 'chief-developer', displayName: 'Chief Developer', priority: 900 },
];
