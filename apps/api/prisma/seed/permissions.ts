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
];
