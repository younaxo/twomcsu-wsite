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
];
