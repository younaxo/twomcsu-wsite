import type { PermissionKey } from '@twomc/shared';
import type { PermissionRequirement } from '../auth/permissions';

/// Навигация админ-панели (PHASE 21). Группа видна, если видим хотя бы
/// один её пункт; пункт — если выполнено `requirement` (см.
/// lib/auth/permissions.ts). Это только UX-фильтр: каждый API-вызов
/// независимо проверяется PermissionsGuard на backend.
///
/// Иконки — имена из lucide-react, резолвятся в компоненте shell
/// (конфиг остаётся server-safe и тестируемым без React).
export type AdminIconName =
  | 'dashboard'
  | 'users'
  | 'shield'
  | 'key'
  | 'scroll'
  | 'megaphone'
  | 'mail'
  | 'settings'
  | 'lock'
  | 'newspaper'
  | 'receipt'
  | 'download'
  | 'wrench';

export interface AdminNavItem {
  /// Абсолютный путь внутри /admin.
  href: string;
  label: string;
  icon: AdminIconName;
  requirement: PermissionRequirement;
  /// Точное совпадение пути (для /admin, иначе активен префикс).
  exact?: boolean;
  /// Ключевые слова для командной палитры.
  keywords?: string[];
}

export interface AdminNavGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: 'overview',
    title: 'Обзор',
    items: [
      {
        href: '/admin',
        label: 'Дашборд',
        icon: 'dashboard',
        requirement: 'dashboard.view',
        exact: true,
        keywords: ['главная', 'сводка'],
      },
    ],
  },
  {
    id: 'people',
    title: 'Люди и доступ',
    items: [
      {
        href: '/admin/users',
        label: 'Пользователи',
        icon: 'users',
        requirement: 'users.view',
        keywords: ['игроки', 'аккаунты', 'бан'],
      },
      {
        href: '/admin/roles',
        label: 'Роли',
        icon: 'shield',
        requirement: 'roles.view',
        keywords: ['права', 'иерархия'],
      },
      {
        href: '/admin/permissions',
        label: 'Permissions',
        icon: 'key',
        requirement: 'permissions.manage',
        keywords: ['матрица', 'ключи', 'права'],
      },
    ],
  },
  {
    id: 'system',
    title: 'Система',
    items: [
      {
        href: '/admin/audit-log',
        label: 'Журнал аудита',
        icon: 'scroll',
        requirement: ['audit_log.view', 'audit_log.stats'],
        keywords: ['лог', 'история', 'действия'],
      },
      {
        href: '/admin/security',
        label: 'Безопасность',
        icon: 'lock',
        requirement: [
          'security.sessions.view',
          'security.suspicious.view',
          'security.logins.view',
          'security.ip_whitelist.create',
        ],
        keywords: ['сессии', 'входы', 'ip', 'whitelist'],
      },
      {
        href: '/admin/settings',
        label: 'Настройки',
        icon: 'settings',
        requirement: ['settings.view', 'settings.site.view'],
        keywords: ['сайт', 'параметры', 'регистрация'],
      },
    ],
  },
  {
    id: 'communications',
    title: 'Коммуникации',
    items: [
      {
        href: '/admin/communications',
        label: 'Сообщения',
        icon: 'mail',
        requirement: ['communications.messages.send', 'communications.messages.bulk'],
        keywords: ['системное', 'сообщение', 'рассылка', 'написать', 'twomc.su'],
      },
      {
        href: '/admin/announcements',
        label: 'Объявления',
        icon: 'megaphone',
        requirement: ['announcements.view', 'settings.alert.view'],
        keywords: ['объявление', 'баннер', 'плашка', 'событие', 'техработы', 'broadcast'],
      },
    ],
  },
  {
    id: 'business',
    title: 'Контент и финансы',
    items: [
      {
        href: '/admin/content',
        label: 'Контент',
        icon: 'newspaper',
        requirement: 'content.view',
        keywords: ['новости', 'формы', 'жалобы'],
      },
      {
        href: '/admin/finance',
        label: 'Финансы',
        icon: 'receipt',
        requirement: ['finance.overview.view', 'finance.transactions.view', 'finance.refunds.view'],
        keywords: ['заказы', 'выручка', 'возвраты', 'магазин'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'Инструменты',
    items: [
      {
        href: '/admin/exports',
        label: 'Экспорт CSV',
        icon: 'download',
        requirement: [
          'users.export',
          'orders.export',
          'reports.export',
          'news.export',
          'audit_log.export',
          'finance.export',
        ],
        keywords: ['csv', 'выгрузка', 'скачать'],
      },
      {
        href: '/admin/tools',
        label: 'Личные инструменты',
        icon: 'wrench',
        requirement: ['saved_filters.view', 'bookmarks.view', 'exports.scheduled.view'],
        keywords: ['закладки', 'фильтры', 'расписание'],
      },
    ],
  },
];

/// Любой ключ, дающий доступ хотя бы к одному разделу админки — если ни
/// одного нет, пользователь не попадает в /admin вовсе.
export const ADMIN_ENTRY_REQUIREMENT: readonly PermissionKey[] = ADMIN_NAV.flatMap((group) =>
  group.items.flatMap((item) => {
    const req = item.requirement;
    if (typeof req === 'string') {
      return [req];
    }
    if (Array.isArray(req)) {
      return [...req];
    }
    const obj = req as { anyOf?: readonly PermissionKey[]; allOf?: readonly PermissionKey[] };
    return [...(obj.anyOf ?? []), ...(obj.allOf ?? [])];
  }),
);

export function isNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/// Пункт навигации для текущего пути — для заголовка/крошек.
export function findNavItem(pathname: string): AdminNavItem | null {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (isNavItemActive(item, pathname)) {
        return item;
      }
    }
  }
  return null;
}
