/// Фабрика query-ключей TanStack Query. Иерархия ключей позволяет
/// инвалидировать весь домен (`queryKeys.users.all`) или конкретный список
/// (`queryKeys.users.list(params)`) после мутаций.
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  dashboard: {
    all: ['admin', 'dashboard'] as const,
  },
  users: {
    all: ['admin', 'users'] as const,
    list: (params: object) => ['admin', 'users', 'list', params] as const,
    detail: (id: string) => ['admin', 'users', 'detail', id] as const,
    effectivePermissions: (id: string) => ['admin', 'users', 'effective-permissions', id] as const,
    badges: (id: string) => ['admin', 'users', 'badges', id] as const,
    punishments: (username: string) => ['admin', 'users', 'punishments', username] as const,
    sessions: (id: string) => ['admin', 'users', 'sessions', id] as const,
  },
  roles: {
    all: ['admin', 'roles'] as const,
    list: ['admin', 'roles', 'list'] as const,
    detail: (id: string) => ['admin', 'roles', 'detail', id] as const,
    history: (id: string) => ['admin', 'roles', 'history', id] as const,
    permissions: ['admin', 'permissions'] as const,
  },
  auditLog: {
    all: ['admin', 'audit-log'] as const,
    list: (params: object) => ['admin', 'audit-log', 'list', params] as const,
    stats: ['admin', 'audit-log', 'stats'] as const,
  },
  settings: {
    kv: ['admin', 'settings', 'kv'] as const,
    site: ['admin', 'settings', 'site'] as const,
    alert: ['admin', 'settings', 'alert'] as const,
    socialLinks: ['admin', 'settings', 'social-links'] as const,
  },
  security: {
    sessions: (params: object) => ['admin', 'security', 'sessions', params] as const,
    suspicious: ['admin', 'security', 'suspicious'] as const,
    logins: (params: object) => ['admin', 'security', 'logins', params] as const,
  },
  content: {
    dashboard: ['admin', 'content', 'dashboard'] as const,
  },
  finance: {
    overview: ['admin', 'finance', 'overview'] as const,
    transactions: (params: object) => ['admin', 'finance', 'transactions', params] as const,
    refunds: (params: object) => ['admin', 'finance', 'refunds', params] as const,
  },
  tools: {
    savedFilters: (page?: string) => ['admin', 'tools', 'saved-filters', page ?? 'all'] as const,
    bookmarks: ['admin', 'tools', 'bookmarks'] as const,
    scheduledExports: ['admin', 'tools', 'scheduled-exports'] as const,
  },
} as const;
