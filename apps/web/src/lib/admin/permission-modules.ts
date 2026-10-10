/// Человекочитаемые названия модулей permission-ключей (часть до первой
/// точки). Неизвестный модуль показывается как есть.
export const PERMISSION_MODULE_LABELS: Record<string, string> = {
  achievements: 'Достижения',
  announcements: 'Объявления',
  audit_log: 'Журнал аудита',
  awards: 'Награды',
  bookmarks: 'Закладки',
  broadcast: 'Объявления',
  chat: 'Чат',
  comment_reports: 'Жалобы на комментарии',
  comments: 'Комментарии',
  communications: 'Коммуникации',
  content: 'Контент',
  custom_positions: 'Особые должности',
  dashboard: 'Дашборд',
  departments: 'Отделы',
  events: 'События',
  exports: 'Экспорт',
  finance: 'Финансы',
  forms: 'Формы',
  media_requests: 'Заявки на медиа-бейдж',
  messages: 'Сообщения',
  news: 'Новости',
  notifications: 'Уведомления',
  orders: 'Заказы',
  positions: 'Должности',
  profile_reports: 'Жалобы на профили',
  promocodes: 'Промокоды',
  reports: 'Обращения',
  roles: 'Роли',
  saved_filters: 'Сохранённые фильтры',
  security: 'Безопасность',
  server_categories: 'Категории серверов',
  servers: 'Сервера',
  settings: 'Настройки',
  store: 'Магазин',
  streams: 'Стримы',
  system: 'Система',
  support: 'Поддержка',
  topics: 'Топики и документы',
  users: 'Пользователи',
  voting: 'Голосования',
};

export function permissionModuleLabel(module: string): string {
  return PERMISSION_MODULE_LABELS[module] ?? module;
}

export function permissionModuleOf(key: string): string {
  return key.split('.')[0] ?? key;
}
