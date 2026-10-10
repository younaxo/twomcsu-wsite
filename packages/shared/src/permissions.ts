/// Реестр permission keys — единый контракт backend и frontend (ADR-0051).
/// Backend: seed (`apps/api/prisma/seed`) синхронизирует реестр в таблицу
/// `permissions`; `@RequirePermissions(...)` остаётся единственной точкой
/// проверки доступа. Frontend: ключи используются только для UX (скрыть
/// разделы/кнопки), типизированы через `PermissionKey`, чтобы опечатка в
/// навигации ловилась на typecheck, а не в рантайме.
/// Пополняется каждой доменной фазой вместе с её защищёнными endpoints
/// (а не весь список 11-PERMISSION-MATRIX.md сразу, см. DECISIONS.md PHASE 06).
export interface PermissionDefinition {
  key: string;
  module: string;
  description: string;
}

export const PERMISSIONS = [
  { key: 'roles.view', module: 'roles', description: 'Просмотр ролей и их прав' },
  { key: 'roles.create', module: 'roles', description: 'Создание роли' },
  { key: 'roles.edit', module: 'roles', description: 'Редактирование роли (кроме прав)' },
  { key: 'roles.delete', module: 'roles', description: 'Удаление роли' },
  { key: 'roles.assign', module: 'roles', description: 'Выдача/снятие роли у пользователя' },
  { key: 'roles.history.view', module: 'roles', description: 'Просмотр истории выдачи роли' },
  {
    key: 'roles.bulk.edit',
    module: 'roles',
    description: 'Массовое изменение прав нескольких ролей (вместе с permissions.manage)',
  },
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
  {
    key: 'chat.messages.pin',
    module: 'chat',
    description: 'Закрепление/открепление сообщения в чате',
  },
  {
    key: 'chat.messages.view',
    module: 'chat',
    description: 'Просмотр любого сообщения чата по id (админ)',
  },
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

  {
    key: 'news.view',
    module: 'news',
    description: 'Просмотр черновиков/архива и статистики новостей',
  },
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

  {
    key: 'voting.sites.view',
    module: 'voting',
    description: 'Просмотр списка vote-сайтов в админке',
  },
  { key: 'voting.sites.create', module: 'voting', description: 'Добавление vote-сайта' },
  { key: 'voting.sites.edit', module: 'voting', description: 'Редактирование vote-сайта' },
  { key: 'voting.sites.delete', module: 'voting', description: 'Удаление vote-сайта' },
  {
    key: 'voting.sites.rotate_secret',
    module: 'voting',
    description: 'Перевыпуск webhook-секрета vote-сайта',
  },

  {
    key: 'streams.view',
    module: 'streams',
    description: 'Просмотр списка стрим-каналов в админке',
  },
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

  {
    key: 'users.mute',
    module: 'users',
    description: 'Быстрый mute пользователя (quick moderation)',
  },
  { key: 'users.warn', module: 'users', description: 'Выдача предупреждения пользователю' },
  { key: 'users.kick', module: 'users', description: 'Принудительный разрыв сессий пользователя' },
  {
    key: 'users.ban',
    module: 'users',
    description: 'Бан пользователя (временный или перманентный)',
  },
  {
    key: 'users.punishments',
    module: 'users',
    description: 'Просмотр и управление историей наказаний пользователя',
  },
  { key: 'users.delete', module: 'users', description: 'Удаление аккаунта пользователя' },
  {
    key: 'messages.hard_delete',
    module: 'messages',
    description: 'Безвозвратное удаление сообщения чата модератором',
  },
  {
    key: 'comments.hard_delete',
    module: 'comments',
    description: 'Безвозвратное удаление комментария профиля модератором',
  },
  {
    key: 'comment_reports.view',
    module: 'comment_reports',
    description: 'Просмотр жалоб на комментарии профиля',
  },
  {
    key: 'comment_reports.edit',
    module: 'comment_reports',
    description: 'Рассмотрение жалобы на комментарий профиля',
  },
  {
    key: 'profile_reports.view',
    module: 'profile_reports',
    description: 'Просмотр жалоб на профили',
  },
  {
    key: 'profile_reports.edit',
    module: 'profile_reports',
    description: 'Рассмотрение жалобы на профиль',
  },

  { key: 'reports.view', module: 'reports', description: 'Просмотр очереди обращений (тикетов)' },
  { key: 'reports.assign', module: 'reports', description: 'Назначение обращения модератору' },
  { key: 'reports.status', module: 'reports', description: 'Изменение статуса обращения' },
  { key: 'reports.verdict', module: 'reports', description: 'Вынесение вердикта по обращению' },
  {
    key: 'reports.messages',
    module: 'reports',
    description: 'Ответ модератора в обращении, мягкое/жёсткое удаление сообщений',
  },
  {
    key: 'reports.messages.pin',
    module: 'reports',
    description: 'Закрепление сообщения в обращении',
  },
  {
    key: 'reports.messages.unpin',
    module: 'reports',
    description: 'Открепление сообщения в обращении',
  },
  {
    key: 'reports.notes',
    module: 'reports',
    description: 'Заметки модератора по обращению (CRUD)',
  },
  {
    key: 'reports.notes.pin',
    module: 'reports',
    description: 'Закрепление заметки модератора',
  },
  {
    key: 'reports.lock',
    module: 'reports',
    description: 'Блокировка обращения для новых сообщений',
  },
  { key: 'reports.stats', module: 'reports', description: 'Просмотр статистики по обращениям' },
  {
    key: 'reports.archived.view',
    module: 'reports',
    description: 'Просмотр архива обращений',
  },
  { key: 'reports.archive', module: 'reports', description: 'Архивация обращения' },
  {
    key: 'reports.unarchive',
    module: 'reports',
    description: 'Восстановление обращения из архива',
  },
  { key: 'reports.delete', module: 'reports', description: 'Безвозвратное удаление обращения' },
  {
    key: 'reports.ban',
    module: 'reports',
    description: 'Бан/разбан пользователя в тикет-системе обращений',
  },
  {
    key: 'support.donations.view',
    module: 'support',
    description: 'Просмотр обращений по проблемам с донатом',
  },

  { key: 'store.categories.view', module: 'store', description: 'Просмотр категорий в админке' },
  { key: 'store.categories.create', module: 'store', description: 'Создание категории' },
  { key: 'store.categories.edit', module: 'store', description: 'Редактирование категории' },
  { key: 'store.categories.delete', module: 'store', description: 'Удаление категории' },
  { key: 'store.products.view', module: 'store', description: 'Просмотр товаров в админке' },
  { key: 'store.products.create', module: 'store', description: 'Создание товара' },
  { key: 'store.products.edit', module: 'store', description: 'Редактирование товара' },
  { key: 'store.products.delete', module: 'store', description: 'Удаление товара' },
  {
    key: 'store.products.variants',
    module: 'store',
    description: 'Управление вариантами (ценами) товара',
  },
  { key: 'store.bundles.create', module: 'store', description: 'Создание набора товаров' },
  { key: 'store.bundles.edit', module: 'store', description: 'Редактирование набора товаров' },
  { key: 'store.bundles.delete', module: 'store', description: 'Удаление набора товаров' },
  {
    key: 'store.discounts.bulk.create',
    module: 'store',
    description: 'Создание скидки за объём/сумму',
  },
  {
    key: 'store.discounts.bulk.edit',
    module: 'store',
    description: 'Редактирование скидки за объём/сумму',
  },
  {
    key: 'store.discounts.bulk.delete',
    module: 'store',
    description: 'Удаление скидки за объём/сумму',
  },
  {
    key: 'store.discounts.loyalty.create',
    module: 'store',
    description: 'Создание скидки за лояльность',
  },
  {
    key: 'store.discounts.loyalty.edit',
    module: 'store',
    description: 'Редактирование скидки за лояльность',
  },
  {
    key: 'store.discounts.loyalty.delete',
    module: 'store',
    description: 'Удаление скидки за лояльность',
  },
  { key: 'store.currencies.view', module: 'store', description: 'Просмотр курсов валют в админке' },
  { key: 'store.currencies.create', module: 'store', description: 'Добавление курса валюты' },
  { key: 'store.currencies.edit', module: 'store', description: 'Редактирование курса валюты' },
  { key: 'promocodes.view', module: 'promocodes', description: 'Просмотр промокодов' },
  { key: 'promocodes.create', module: 'promocodes', description: 'Создание промокода' },
  { key: 'promocodes.edit', module: 'promocodes', description: 'Редактирование промокода' },
  { key: 'promocodes.delete', module: 'promocodes', description: 'Удаление промокода' },
  { key: 'orders.view', module: 'orders', description: 'Просмотр списка заказов в админке' },
  { key: 'orders.stats', module: 'orders', description: 'Просмотр статистики заказов' },
  { key: 'orders.cancel', module: 'orders', description: 'Отмена заказа' },
  { key: 'orders.refund', module: 'orders', description: 'Возврат средств по заказу' },
  { key: 'store.stats', module: 'store', description: 'Просмотр общей статистики магазина' },
  {
    key: 'store.stats.overview.view',
    module: 'store',
    description: 'Просмотр сводки статистики магазина',
  },
  {
    key: 'store.stats.sales_by_day.view',
    module: 'store',
    description: 'Просмотр продаж по дням',
  },
  {
    key: 'store.stats.sales_by_category.view',
    module: 'store',
    description: 'Просмотр продаж по категориям',
  },
  {
    key: 'store.stats.top_products.view',
    module: 'store',
    description: 'Просмотр топа товаров по продажам',
  },
  {
    key: 'store.stats.revenue_by_week.view',
    module: 'store',
    description: 'Просмотр выручки по неделям',
  },

  {
    key: 'server_categories.view',
    module: 'server_categories',
    description: 'Просмотр категорий серверов в админке',
  },
  {
    key: 'server_categories.create',
    module: 'server_categories',
    description: 'Создание категории серверов',
  },
  {
    key: 'server_categories.edit',
    module: 'server_categories',
    description: 'Редактирование категории серверов',
  },
  {
    key: 'server_categories.delete',
    module: 'server_categories',
    description: 'Удаление категории серверов',
  },
  { key: 'servers.view', module: 'servers', description: 'Просмотр списка серверов в админке' },
  { key: 'servers.create', module: 'servers', description: 'Добавление сервера' },
  { key: 'servers.edit', module: 'servers', description: 'Редактирование сервера' },
  { key: 'servers.delete', module: 'servers', description: 'Удаление сервера' },
  { key: 'servers.logs', module: 'servers', description: 'Просмотр истории статуса сервера' },

  {
    key: 'achievements.view',
    module: 'achievements',
    description: 'Просмотр списка достижений в админке',
  },
  { key: 'achievements.create', module: 'achievements', description: 'Создание достижения' },
  { key: 'achievements.edit', module: 'achievements', description: 'Редактирование достижения' },
  { key: 'achievements.delete', module: 'achievements', description: 'Удаление достижения' },
  {
    key: 'achievements.check_all_users.create',
    module: 'achievements',
    description: 'Запуск пересчёта прогресса достижений для всех пользователей',
  },
  { key: 'awards.view', module: 'awards', description: 'Просмотр списка наград в админке' },
  { key: 'awards.create', module: 'awards', description: 'Создание награды' },
  { key: 'awards.edit', module: 'awards', description: 'Редактирование награды' },
  { key: 'awards.delete', module: 'awards', description: 'Удаление награды' },
  {
    key: 'media_requests.view',
    module: 'media_requests',
    description: 'Просмотр заявок на бейдж создателя контента',
  },
  {
    key: 'media_requests.edit',
    module: 'media_requests',
    description: 'Рассмотрение заявки на бейдж создателя контента',
  },
  {
    key: 'users.achievements',
    module: 'users',
    description: 'Отзыв вручную выданного достижения пользователя',
  },
  {
    key: 'users.achievements.grant',
    module: 'users',
    description: 'Ручная выдача достижения пользователю',
  },
  { key: 'users.awards', module: 'users', description: 'Выдача/отзыв награды пользователю' },
  { key: 'users.badges', module: 'users', description: 'Выдача/отзыв бейджа пользователю' },
  {
    key: 'users.access_level.edit',
    module: 'users',
    description: 'Изменение уровня доступа пользователя (не выше собственного, ADR-0062)',
  },
  {
    key: 'users.access_level.edit_self',
    module: 'users',
    description: 'Изменение собственного уровня доступа',
  },

  { key: 'dashboard.view', module: 'dashboard', description: 'Просмотр главного дашборда админки' },
  { key: 'audit_log.view', module: 'audit_log', description: 'Просмотр журнала аудита' },
  {
    key: 'audit_log.stats',
    module: 'audit_log',
    description: 'Сводная статистика по журналу аудита',
  },
  { key: 'audit_log.export', module: 'audit_log', description: 'Экспорт журнала аудита в CSV' },
  {
    key: 'broadcast.create',
    module: 'broadcast',
    description: 'Рассылка объявления всем/части пользователей',
  },
  { key: 'settings.view', module: 'settings', description: 'Просмотр простых KV-настроек сайта' },
  {
    key: 'settings.edit',
    module: 'settings',
    description: 'Редактирование простых KV-настроек сайта',
  },
  {
    key: 'settings.site.view',
    module: 'settings',
    description: 'Просмотр структурированных настроек сайта',
  },
  {
    key: 'settings.site.edit',
    module: 'settings',
    description: 'Редактирование структурированных настроек сайта',
  },
  {
    key: 'settings.alert.view',
    module: 'settings',
    description: 'Просмотр глобальной плашки сайта',
  },
  {
    key: 'settings.alert.edit',
    module: 'settings',
    description: 'Включение, выключение и редактирование глобальной плашки сайта',
  },
  {
    key: 'settings.seasonal.view',
    module: 'settings',
    description: 'Просмотр настроек сезонной системы',
  },
  {
    key: 'settings.seasonal.edit',
    module: 'settings',
    description: 'Управление сезонной системой: включение, сезон, эффекты, расписание',
  },

  {
    key: 'communications.messages.send',
    module: 'communications',
    description: 'Отправка личных системных сообщений от имени twomc.su',
  },
  {
    key: 'communications.messages.bulk',
    module: 'communications',
    description: 'Массовая рассылка системных сообщений (всем, роли, выбранным)',
  },
  {
    key: 'announcements.view',
    module: 'announcements',
    description: 'Просмотр объявлений сайта, включая черновики и снятые',
  },
  {
    key: 'announcements.manage',
    module: 'announcements',
    description: 'Создание, изменение, публикация, снятие и удаление объявлений',
  },
  {
    key: 'system.maintenance.view',
    module: 'system',
    description: 'Просмотр настроек технических работ',
  },
  {
    key: 'system.maintenance.manage',
    module: 'system',
    description: 'Включение и выключение технических работ (полных и частичных)',
  },
  {
    key: 'system.maintenance.bypass',
    module: 'system',
    description: 'Доступ к сайту во время техработ и к выключенным модулям',
  },
  {
    key: 'system.modules.view',
    module: 'system',
    description: 'Просмотр модулей сайта и их состояния',
  },
  {
    key: 'system.modules.manage',
    module: 'system',
    description: 'Включение и выключение обычных модулей сайта',
  },
  {
    key: 'system.modules.protected',
    module: 'system',
    description: 'Выключение защищённых модулей (уведомления, профили, магазин)',
  },
  {
    key: 'system.storage.view',
    module: 'system',
    description: 'Просмотр объёма служебных журналов и сроков хранения',
  },
  {
    key: 'system.storage.manage',
    module: 'system',
    description: 'Сроки хранения и очистка технических журналов и статусов серверов',
  },
  {
    key: 'system.storage.audit',
    module: 'system',
    description: 'Сроки хранения и очистка журнала аудита и журнала безопасности',
  },

  {
    key: 'saved_filters.view',
    module: 'saved_filters',
    description: 'Просмотр своих сохранённых фильтров админки',
  },
  {
    key: 'saved_filters.create',
    module: 'saved_filters',
    description: 'Создание сохранённого фильтра',
  },
  {
    key: 'saved_filters.edit',
    module: 'saved_filters',
    description: 'Редактирование сохранённого фильтра',
  },
  {
    key: 'saved_filters.delete',
    module: 'saved_filters',
    description: 'Удаление сохранённого фильтра',
  },

  { key: 'bookmarks.view', module: 'bookmarks', description: 'Просмотр своих закладок админки' },
  { key: 'bookmarks.create', module: 'bookmarks', description: 'Создание закладки' },
  { key: 'bookmarks.edit', module: 'bookmarks', description: 'Редактирование закладки' },
  { key: 'bookmarks.delete', module: 'bookmarks', description: 'Удаление закладки' },
  { key: 'bookmarks.reorder', module: 'bookmarks', description: 'Изменение порядка закладок' },

  {
    key: 'exports.scheduled.view',
    module: 'exports',
    description: 'Просмотр своих запланированных экспортов',
  },
  {
    key: 'exports.scheduled.create',
    module: 'exports',
    description: 'Создание запланированного экспорта',
  },
  {
    key: 'exports.scheduled.edit',
    module: 'exports',
    description: 'Редактирование запланированного экспорта',
  },
  {
    key: 'exports.scheduled.delete',
    module: 'exports',
    description: 'Удаление запланированного экспорта',
  },

  {
    key: 'security.sessions.view',
    module: 'security',
    description: 'Просмотр активных сессий пользователей',
  },
  {
    key: 'security.suspicious.view',
    module: 'security',
    description: 'Просмотр подозрительной активности (brute-force)',
  },
  { key: 'security.logins.view', module: 'security', description: 'Просмотр истории входов' },
  {
    key: 'security.ip_whitelist.create',
    module: 'security',
    description: 'Изменение IP-белого списка',
  },

  { key: 'content.view', module: 'content', description: 'Просмотр дашборда контент-модерации' },
  {
    key: 'finance.overview.view',
    module: 'finance',
    description: 'Просмотр финансового обзора магазина',
  },
  {
    key: 'finance.transactions.view',
    module: 'finance',
    description: 'Просмотр списка транзакций (заказов)',
  },
  { key: 'finance.refunds.view', module: 'finance', description: 'Просмотр списка возвратов' },
  {
    key: 'finance.export',
    module: 'finance',
    description: 'Экспорт транзакций в CSV из раздела Finance',
  },

  {
    key: 'users.bulk.edit',
    module: 'users',
    description: 'Массовые операции над пользователями (бан/разбан)',
  },
  { key: 'users.export', module: 'users', description: 'Экспорт списка пользователей в CSV' },
  { key: 'orders.export', module: 'orders', description: 'Экспорт списка заказов в CSV' },
  { key: 'reports.export', module: 'reports', description: 'Экспорт списка обращений в CSV' },
  { key: 'news.export', module: 'news', description: 'Экспорт списка новостей в CSV' },
] as const satisfies readonly PermissionDefinition[];

/// Строковый литерал всех зарегистрированных ключей.
export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
