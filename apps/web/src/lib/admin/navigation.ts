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
  | 'power'
  | 'sparkles'
  | 'database'
  | 'settings'
  | 'lock'
  | 'newspaper'
  | 'receipt'
  | 'download'
  | 'wrench'
  | 'award'
  | 'briefcase';

/// Подраздел пункта (ADR-0139): связанные страницы под одним пунктом, чтобы
/// навигация не разрасталась; в оболочке переключаются вкладками.
export interface AdminNavSection {
  href: string;
  label: string;
  requirement: PermissionRequirement;
}

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
  /// Подразделы: пункт активен на любой их странице и ведёт на первый
  /// доступный пользователю (см. resolveNavItem).
  sections?: AdminNavSection[];
}

export interface AdminNavGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
}

/// Группы — по ТЗ админки (§62): логическая группировка вместо длинного списка.
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
        label: 'Роли и права',
        icon: 'shield',
        requirement: ['roles.view', 'permissions.manage'],
        keywords: ['права', 'иерархия', 'матрица', 'ключи', 'permissions'],
        sections: [
          { href: '/admin/roles', label: 'Роли', requirement: 'roles.view' },
          { href: '/admin/permissions', label: 'Permissions', requirement: 'permissions.manage' },
        ],
      },
      {
        href: '/admin/positions',
        label: 'Команда',
        icon: 'briefcase',
        requirement: ['positions.view', 'departments.view', 'custom_positions.view'],
        keywords: ['должности', 'отделы', 'свои должности', 'стафф'],
        sections: [
          { href: '/admin/positions', label: 'Должности', requirement: 'positions.view' },
          { href: '/admin/departments', label: 'Отделы', requirement: 'departments.view' },
          {
            href: '/admin/custom-positions',
            label: 'Свои должности',
            requirement: 'custom_positions.view',
          },
        ],
      },
    ],
  },
  {
    id: 'content',
    title: 'Контент',
    items: [
      {
        href: '/admin/content',
        label: 'Контент',
        icon: 'newspaper',
        requirement: ['content.view', 'news.view'],
        keywords: ['новости', 'формы', 'жалобы', 'статьи', 'патч-ноуты'],
        sections: [
          { href: '/admin/content', label: 'Обзор', requirement: 'content.view' },
          { href: '/admin/news', label: 'Новости', requirement: 'news.view' },
        ],
      },
      {
        href: '/admin/reports',
        label: 'Обращения',
        icon: 'scroll',
        requirement: 'reports.view',
        keywords: ['жалобы', 'тикеты', 'обжалования', 'поддержка'],
      },
    ],
  },
  {
    id: 'gamification',
    title: 'Геймификация',
    items: [
      {
        href: '/admin/achievements',
        label: 'Достижения и награды',
        icon: 'award',
        requirement: ['achievements.view', 'awards.view'],
        keywords: ['ачивки', 'награды', 'пересчёт', 'прогресс'],
        sections: [
          { href: '/admin/achievements', label: 'Достижения', requirement: 'achievements.view' },
          { href: '/admin/awards', label: 'Награды', requirement: 'awards.view' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Финансы',
    items: [
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
    id: 'communications',
    title: 'Коммуникации',
    items: [
      {
        href: '/admin/chat',
        label: 'Чат',
        icon: 'scroll',
        requirement: ['chat.mutes.view', 'chat.bans.view', 'chat.messages.search.view'],
        keywords: ['муты', 'баны', 'модерация', 'сообщения', 'поиск'],
      },
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
    id: 'appearance',
    title: 'Оформление',
    items: [
      {
        href: '/admin/appearance',
        label: 'Сезонное оформление',
        icon: 'sparkles',
        requirement: 'settings.seasonal.view',
        keywords: ['сезон', 'праздник', 'хэллоуин', 'новый год', 'эффекты', 'снег'],
      },
    ],
  },
  {
    id: 'system',
    title: 'Система',
    items: [
      {
        href: '/admin/servers',
        label: 'Серверы',
        icon: 'database',
        requirement: 'servers.view',
        keywords: ['minecraft', 'статус', 'адрес', 'порт', 'игровые'],
      },
      {
        href: '/admin/system',
        label: 'Техработы и модули',
        icon: 'power',
        requirement: ['system.maintenance.view', 'system.modules.view'],
        keywords: ['техработы', 'обслуживание', 'модули', 'выключить', 'maintenance'],
      },
      {
        href: '/admin/storage',
        label: 'Хранилище и журналы',
        icon: 'database',
        requirement: 'system.storage.view',
        keywords: ['журналы', 'логи', 'очистка', 'хранение', 'retention', 'место'],
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
    id: 'security',
    title: 'Безопасность',
    items: [
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
    ],
  },
  {
    id: 'audit',
    title: 'Аудит',
    items: [
      {
        href: '/admin/audit-log',
        label: 'Журнал аудита',
        icon: 'scroll',
        requirement: ['audit_log.view', 'audit_log.stats'],
        keywords: ['лог', 'история', 'действия'],
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

function matchesPath(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return (
    matchesPath(item.href, pathname) ||
    (item.sections?.some((section) => matchesPath(section.href, pathname)) ?? false)
  );
}

export function isNavSectionActive(section: AdminNavSection, pathname: string): boolean {
  return matchesPath(section.href, pathname);
}

/// Пункт под права пользователя: остаются только доступные подразделы, а
/// ссылка ведёт на первый из них — без права на первый игрок попадёт на свой.
export function resolveNavItem(
  item: AdminNavItem,
  can: (requirement: PermissionRequirement) => boolean,
): AdminNavItem {
  if (!item.sections) {
    return item;
  }
  const sections = item.sections.filter((section) => can(section.requirement));
  return { ...item, href: sections[0]?.href ?? item.href, sections };
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
