/// Реестр модулей сайта (ADR-0082). Ключи обычных и защищённых модулей —
/// это метки `@SiteModule(key)` на реальных публичных контроллерах API;
/// `site-modules.registry.spec.ts` сверяет реестр с кодом в обе стороны.
/// Ядро не помечается: его маршруты guard не блокирует никогда.

export type SiteModuleTier = 'core' | 'protected' | 'regular';

export interface SiteModuleDefinition {
  key: string;
  label: string;
  description: string;
  tier: SiteModuleTier;
  /// Прежний флаг `SiteSettings.<field>Enabled` — значение по умолчанию, пока
  /// у модуля нет записи `ModuleStatus`.
  legacyFlag?:
    | 'chatEnabled'
    | 'friendsEnabled'
    | 'storeEnabled'
    | 'commentsEnabled'
    | 'newsEnabled'
    | 'reportsEnabled';
}

export const SITE_MODULES: readonly SiteModuleDefinition[] = [
  {
    key: 'auth',
    label: 'Вход и регистрация',
    description: 'Вход, регистрация, сессии, привязка Minecraft и соцсетей',
    tier: 'core',
  },
  {
    key: 'rbac',
    label: 'Роли и права',
    description: 'Проверка прав доступа на каждом запросе',
    tier: 'core',
  },
  {
    key: 'admin',
    label: 'Админ-панель',
    description: 'Управление сайтом — нужна, чтобы включить модули обратно',
    tier: 'core',
  },
  {
    key: 'health',
    label: 'Мониторинг',
    description: 'Проверки доступности API и базы данных',
    tier: 'core',
  },
  {
    key: 'notifications',
    label: 'Уведомления',
    description: 'Центр уведомлений и системные сообщения',
    tier: 'protected',
  },
  {
    key: 'profiles',
    label: 'Профили',
    description: 'Публичные профили игроков и их редактирование',
    tier: 'protected',
  },
  {
    key: 'store',
    label: 'Магазин',
    description: 'Каталог, корзина и заказы (приём платежей не прерывается)',
    tier: 'protected',
    legacyFlag: 'storeEnabled',
  },
  {
    key: 'chat',
    label: 'Чат',
    description: 'Общий чат сайта',
    tier: 'regular',
    legacyFlag: 'chatEnabled',
  },
  {
    key: 'direct-messages',
    label: 'Личные сообщения',
    description: 'Личные и групповые беседы',
    tier: 'regular',
  },
  {
    key: 'friends',
    label: 'Друзья',
    description: 'Заявки и список друзей',
    tier: 'regular',
    legacyFlag: 'friendsEnabled',
  },
  {
    key: 'news',
    label: 'Новости',
    description: 'Лента новостей, лайки и комментарии к новостям',
    tier: 'regular',
    legacyFlag: 'newsEnabled',
  },
  {
    key: 'comments',
    label: 'Комментарии профилей',
    description: 'Комментарии на страницах игроков',
    tier: 'regular',
    legacyFlag: 'commentsEnabled',
  },
  {
    key: 'events',
    label: 'События',
    description: 'Календарь событий проекта',
    tier: 'regular',
  },
  {
    key: 'voting',
    label: 'Голосование',
    description:
      'Голосование за сервер (вебхуки сайтов-рейтингов не прерываются)',
    tier: 'regular',
  },
  {
    key: 'uploads',
    label: 'Загрузка файлов',
    description: 'Загрузка аватаров, обложек и вложений',
    tier: 'regular',
  },
  {
    key: 'reports',
    label: 'Жалобы и обращения',
    description: 'Обращения игроков и жалобы',
    tier: 'regular',
    legacyFlag: 'reportsEnabled',
  },
  {
    key: 'minecraft',
    label: 'Серверы Minecraft',
    description: 'Список серверов и их статус',
    tier: 'regular',
  },
  {
    key: 'leaderboards',
    label: 'Рейтинги',
    description: 'Таблицы лидеров',
    tier: 'regular',
  },
  {
    key: 'achievements',
    label: 'Достижения и награды',
    description: 'Достижения, награды и их витрина',
    tier: 'regular',
  },
  {
    key: 'activity',
    label: 'Лента активности',
    description: 'Активность игроков и общая лента',
    tier: 'regular',
  },
  {
    key: 'topics',
    label: 'Темы',
    description: 'Темы и обсуждения',
    tier: 'regular',
  },
  {
    key: 'streams',
    label: 'Стримы',
    description: 'Трансляции партнёров',
    tier: 'regular',
  },
  {
    key: 'forms',
    label: 'Формы',
    description: 'Заявки и анкеты',
    tier: 'regular',
  },
];

export function findSiteModule(key: string): SiteModuleDefinition | undefined {
  return SITE_MODULES.find((item) => item.key === key);
}
