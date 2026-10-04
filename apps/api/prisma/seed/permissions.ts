/// Реестр permission keys. Пополняется каждой доменной фазой вместе с её
/// защищёнными endpoints (а не весь список 11-PERMISSION-MATRIX.md сразу —
/// большинство модулей оттуда ещё не реализованы, см. DECISIONS.md PHASE 06).
export interface PermissionDefinition {
  key: string;
  module: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'roles.view', module: 'roles', description: 'Просмотр ролей и их прав' },
  { key: 'roles.create', module: 'roles', description: 'Создание роли' },
  { key: 'roles.edit', module: 'roles', description: 'Редактирование роли (кроме прав)' },
  { key: 'roles.delete', module: 'roles', description: 'Удаление роли' },
  { key: 'roles.assign', module: 'roles', description: 'Выдача/снятие роли у пользователя' },
  { key: 'roles.history.view', module: 'roles', description: 'Просмотр истории выдачи роли' },
  {
    key: 'permissions.manage',
    module: 'roles',
    description: 'Просмотр реестра permissions и изменение набора прав роли',
  },

  { key: 'positions.view', module: 'positions', description: 'Просмотр позиций' },
  { key: 'positions.create', module: 'positions', description: 'Создание позиции' },
  { key: 'positions.edit', module: 'positions', description: 'Редактирование позиции' },
  { key: 'positions.delete', module: 'positions', description: 'Удаление позиции' },
  { key: 'positions.assign', module: 'positions', description: 'Назначение позиции пользователю' },

  { key: 'departments.view', module: 'departments', description: 'Просмотр отделов' },
  { key: 'departments.create', module: 'departments', description: 'Создание отдела' },
  { key: 'departments.edit', module: 'departments', description: 'Редактирование отдела' },
  { key: 'departments.delete', module: 'departments', description: 'Удаление отдела' },
  {
    key: 'departments.assign',
    module: 'departments',
    description: 'Добавление/удаление пользователя из отдела',
  },

  {
    key: 'custom_positions.view',
    module: 'custom_positions',
    description: 'Просмотр кастомных должностей',
  },
  {
    key: 'custom_positions.create',
    module: 'custom_positions',
    description: 'Создание кастомной должности',
  },
  {
    key: 'custom_positions.edit',
    module: 'custom_positions',
    description: 'Редактирование кастомной должности',
  },
  {
    key: 'custom_positions.delete',
    module: 'custom_positions',
    description: 'Удаление кастомной должности',
  },
  {
    key: 'custom_positions.assign',
    module: 'custom_positions',
    description: 'Назначение/снятие кастомной должности у пользователя',
  },

  { key: 'users.view', module: 'users', description: 'Просмотр списка и карточки пользователя' },

  { key: 'chat.channels.create', module: 'chat', description: 'Создание канала чата' },
  { key: 'chat.channels.edit', module: 'chat', description: 'Редактирование канала чата' },
  { key: 'chat.channels.delete', module: 'chat', description: 'Удаление канала чата' },
  {
    key: 'chat.messages.post_readonly',
    module: 'chat',
    description: 'Отправка сообщений в read-only канал',
  },
  {
    key: 'chat.messages.delete',
    module: 'chat',
    description: 'Удаление чужого сообщения в чате (soft-delete с причиной)',
  },
  { key: 'chat.messages.pin', module: 'chat', description: 'Закрепление/открепление сообщения в чате' },
  { key: 'chat.messages.view', module: 'chat', description: 'Просмотр любого сообщения чата по id (админ)' },
  {
    key: 'chat.messages.search.view',
    module: 'chat',
    description: 'Полнотекстовый поиск по сообщениям чата (админ)',
  },
  { key: 'chat.mutes.view', module: 'chat', description: 'Просмотр списка мутов чата' },
  { key: 'chat.mutes.create', module: 'chat', description: 'Выдача мута в чате' },
  { key: 'chat.mutes.delete', module: 'chat', description: 'Снятие мута в чате' },
  { key: 'chat.bans.view', module: 'chat', description: 'Просмотр списка банов чата' },
  { key: 'chat.bans.create', module: 'chat', description: 'Бан пользователя в чате' },
  { key: 'chat.bans.delete', module: 'chat', description: 'Снятие бана в чате' },

  {
    key: 'notifications.webhooks.view',
    module: 'notifications',
    description: 'Просмотр системных Discord-вебхуков',
  },
  {
    key: 'notifications.webhooks.create',
    module: 'notifications',
    description: 'Создание системного Discord-вебхука',
  },
  {
    key: 'notifications.webhooks.edit',
    module: 'notifications',
    description: 'Редактирование системного Discord-вебхука',
  },
  {
    key: 'notifications.webhooks.delete',
    module: 'notifications',
    description: 'Удаление системного Discord-вебхука',
  },
  {
    key: 'notifications.broadcast',
    module: 'notifications',
    description: 'Массовая рассылка уведомления всем или части пользователей',
  },
  {
    key: 'notifications.stats.view',
    module: 'notifications',
    description: 'Просмотр агрегированной статистики уведомлений',
  },

  { key: 'news.view', module: 'news', description: 'Просмотр черновиков/архива и статистики новостей' },
  { key: 'news.create', module: 'news', description: 'Создание новости' },
  { key: 'news.edit', module: 'news', description: 'Редактирование новости' },
  { key: 'news.delete', module: 'news', description: 'Архивация новости' },
  { key: 'news.pin', module: 'news', description: 'Закрепление/открепление новости' },
  { key: 'news.feature', module: 'news', description: 'Вынесение новости в рекомендуемые' },
  {
    key: 'news.comments.pin',
    module: 'news',
    description: 'Закрепление/открепление комментария к новости',
  },
  {
    key: 'news.comments.delete',
    module: 'news',
    description: 'Удаление чужого комментария к новости (модерация)',
  },

  { key: 'events.view', module: 'events', description: 'Просмотр списка событий в админке' },
  { key: 'events.create', module: 'events', description: 'Создание события' },
  { key: 'events.edit', module: 'events', description: 'Редактирование события' },
  { key: 'events.publish', module: 'events', description: 'Публикация события' },
  { key: 'events.cancel', module: 'events', description: 'Отмена события' },
  { key: 'events.delete', module: 'events', description: 'Удаление события' },
  {
    key: 'events.view.staff',
    module: 'events',
    description: 'Просмотр событий с видимостью STAFF',
  },

  { key: 'topics.view', module: 'topics', description: 'Просмотр списка/карточки темы в админке' },
  { key: 'topics.create', module: 'topics', description: 'Создание темы' },
  { key: 'topics.edit', module: 'topics', description: 'Редактирование темы' },
  { key: 'topics.delete', module: 'topics', description: 'Удаление темы' },
  { key: 'topics.reorder', module: 'topics', description: 'Изменение порядка тем' },
  { key: 'topics.pin', module: 'topics', description: 'Закрепление/открепление темы' },
  {
    key: 'topics.view.helper',
    module: 'topics',
    description: 'Просмотр тем с видимостью HELPER_ONLY',
  },
  {
    key: 'topics.view.moderator',
    module: 'topics',
    description: 'Просмотр тем с видимостью MODERATOR_ONLY',
  },
  {
    key: 'topics.view.admin',
    module: 'topics',
    description: 'Просмотр тем с видимостью ADMIN_ONLY',
  },
  {
    key: 'topics.view.owner',
    module: 'topics',
    description: 'Просмотр тем с видимостью OWNER_ONLY',
  },

  { key: 'voting.sites.view', module: 'voting', description: 'Просмотр списка vote-сайтов в админке' },
  { key: 'voting.sites.create', module: 'voting', description: 'Добавление vote-сайта' },
  { key: 'voting.sites.edit', module: 'voting', description: 'Редактирование vote-сайта' },
  { key: 'voting.sites.delete', module: 'voting', description: 'Удаление vote-сайта' },
  {
    key: 'voting.sites.rotate_secret',
    module: 'voting',
    description: 'Перевыпуск webhook-секрета vote-сайта',
  },

  { key: 'streams.view', module: 'streams', description: 'Просмотр списка стрим-каналов в админке' },
  { key: 'streams.create', module: 'streams', description: 'Добавление стрим-канала' },
  { key: 'streams.edit', module: 'streams', description: 'Редактирование стрим-канала' },
  { key: 'streams.delete', module: 'streams', description: 'Удаление стрим-канала' },
  {
    key: 'streams.refresh',
    module: 'streams',
    description: 'Ручной запуск обновления статуса стримов',
  },

  { key: 'forms.view', module: 'forms', description: 'Просмотр списка/карточки формы в админке' },
  { key: 'forms.create', module: 'forms', description: 'Создание формы' },
  { key: 'forms.edit', module: 'forms', description: 'Редактирование формы и её полей' },
  { key: 'forms.delete', module: 'forms', description: 'Архивация формы' },
  { key: 'forms.publish', module: 'forms', description: 'Публикация формы' },
  { key: 'forms.close', module: 'forms', description: 'Закрытие формы для новых ответов' },
  { key: 'forms.duplicate', module: 'forms', description: 'Дублирование формы' },
  {
    key: 'forms.responses',
    module: 'forms',
    description: 'Просмотр и удаление ответов на форму',
  },
  {
    key: 'forms.invites',
    module: 'forms',
    description: 'Управление инвайт-кодами формы (список/создание/удаление)',
  },
  { key: 'forms.stats', module: 'forms', description: 'Просмотр статистики формы' },
  {
    key: 'forms.view.helper',
    module: 'forms',
    description: 'Просмотр форм с видимостью HELPER_ONLY',
  },
  {
    key: 'forms.view.moderator',
    module: 'forms',
    description: 'Просмотр форм с видимостью MODERATOR_ONLY',
  },
  {
    key: 'forms.view.admin',
    module: 'forms',
    description: 'Просмотр форм с видимостью ADMIN_ONLY',
  },
  {
    key: 'forms.view.owner',
    module: 'forms',
    description: 'Просмотр форм с видимостью OWNER_ONLY',
  },
];
