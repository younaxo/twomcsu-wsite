# 10 — RBAC и Permissions

Документ состоит из двух частей: **A. Текущая система (факт по коду)** и **B. Спецификация новой системы (PROPOSED)**. Полный предлагаемый реестр ключей — в 11-PERMISSION-MATRIX.md.

# A. Текущая система

## A.1 Модель
- `enum RoleGroup { PLAYER, HELPER, MODERATOR, ADMIN, OWNER }` (`schema.prisma:10`, дублируется в `packages/shared/src/user.ts`).
- `User.roleGroup RoleGroup @default(PLAYER)` — **единственное** поле, определяющее доступ. Иерархия линейная: `roleGroupOrder = [PLAYER, HELPER, MODERATOR, ADMIN, OWNER]`, `hasRoleGroup(current, required)` = «текущая ≥ требуемой».
- `Position` (`schema.prisma:19`, ~40 записей в seed `positions.data.ts`) — **косметический** титул внутри группы (`name`, `slug`, `displayName`, `group`, `color`, `priority`, `isVisible`, `isDefault`). Комментарий в схеме: *«purely cosmetic, permissions come from roleGroup»*. `User.positionId` обязателен (FK).
- Соответствие seed: `Owner`, `Chief Curator`, `Senior Curator`, `Chief Developer`, `Curator`, `Head PR Manager`, `Chief Technical Administrator`, `Head Developer` → группа `OWNER`; `Special Administrator`, `Developer`, `Chief Administrator`, `PR Manager`, `Technical Administrator` → `ADMIN`; `Head Cheat Hunter` … `Junior Moderator` (включая `Administrator`, `Senior Administrator`, `Support`) → `MODERATOR`; `Chief Helper` … `Junior Helper` → `HELPER`; `Default` и донатные (`Ares`, `Deimos`, `Apollon`, `Kratos`, `Svarog`, `Gefest`, `Polemicism`) → `PLAYER`. То есть сегодня **Senior Curator, Curator, Head PR Manager и др. имеют полный доступ OWNER**, что противоречит требованию «полный доступ только у Owner / Chief Curator / Chief Developer».
- Дополнительно существуют `UserDepartment`/`Department` и `UserCustomPosition` — кастомные должности/отделы, **на доступ не влияют**.

## A.2 Проверка на backend
- `@Roles(RoleGroup.X)` (`SetMetadata('roles', [...])`) + `RolesGuard`: пропускает, если `user.roleGroup >= X`; иначе `403 «Недостаточно прав»`. Применяется на уровне класса или метода.
- `roleGroup` берётся **из JWT** (`JwtStrategy.validate`), БД на каждом запросе не читается → изменение роли вступает в силу максимум через `JWT_ACCESS_EXPIRES` (15 мин) либо после `POST /auth/refresh`.
- Распределение 497 endpoints по требуемой группе: нет ограничения по роли — **228**; `HELPER` — 14; `MODERATOR` — 19; `ADMIN` — **207**; `OWNER` — 29. Из 269 endpoints с `@Roles` 186 изменяют данные.
- Иерархия «кто над кем» проверяется точечно в сервисах (например `QuickModerationService`: «Недостаточно прав для этого бана»; `ModerationService` чата получает `roleGroup` актёра). Централизованной проверки нет, а массовый бан `AdminUsersService.bulk(action: 'ban')` проверяет только запрет бана самого себя.
- В WebSocket роль берётся из `client.data`/БД при подключении и передаётся в `ModerationService`.

## A.3 Frontend
- `useRoleGuard(RoleGroup.X)` (`components/admin/useRoleGuard`) в layout'ах: `/admin` → `ADMIN`, `/dashboard` → `OWNER`, `/moderation` → см. layout.
- Меню админки — захардкоженный массив `adminLinks` (33 пункта) в `app/[locale]/admin/layout.tsx`; формируется **не** из permissions.
- `middleware.ts` проверяет только наличие cookie `refresh_token`.

## A.4 Недостатки (кратко)
1. Роль = фиксированный набор доступов; точечно выдать право нельзя.
2. Полный доступ получают 8 позиций группы OWNER.
3. Нет приоритета ролей и запрета «не выше себя» в общем виде.
4. Нет истории выдачи ролей (`role assignment history`), аудит ролей — только `user.change-role`.
5. Роль в JWT → устаревание до 15 минут.

# B. Новая система (PROPOSED)

## B.1 Принципы
1. Роль — контейнер permissions; **имя роли ничего не значит для доступа**.
2. Единственное место, знающее про superuser: `PermissionService.isSuperuser(user)` (флаг `Role.isSuperuser` + wildcard `*`). Код `if (role === 'OWNER')` запрещён вне этого сервиса.
3. Проверка только на backend через `@RequirePermissions('users.edit')` + `PermissionsGuard`. Frontend лишь скрывает UI.
4. Priority ≠ permissions: priority определяет, **над кем** можно действовать; permission — **что** можно делать.
5. Superuser-роли: `Owner`, `Chief Curator`, `Chief Developer` (`isSuperuser = true`, `isSystem = true`).

## B.2 Схема (Prisma, предложение — не применено)
```prisma
model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  slug        String   @unique
  displayName String
  priority    Int                       // выше = старше
  color       String?  @db.VarChar(7)   // только если уже используется в UI (сейчас Position.color)
  isSystem    Boolean  @default(false)  // нельзя удалить/переименовать
  isSuperuser Boolean  @default(false)  // единственный источник wildcard
  isAssignable Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  permissions RolePermission[]
  users       UserRole[]
}
model Permission {
  id          String @id @default(cuid())
  key         String @unique            // 'users.edit'
  module      String
  description String
  roles       RolePermission[]
}
enum PermissionEffect { ALLOW DENY }
model RolePermission {
  roleId       String
  permissionId String
  effect       PermissionEffect @default(ALLOW)   // сейчас используется только ALLOW
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
}
model UserRole {
  userId     String
  roleId     String
  assignedBy String?
  assignedAt DateTime @default(now())
  @@id([userId, roleId])
}
model RoleAssignmentLog {            // история выдачи/снятия
  id String @id @default(cuid())
  userId String; roleId String; action String  // GRANTED | REVOKED
  actorId String; reason String?; createdAt DateTime @default(now())
}
```
`Position` остаётся косметическим (бейдж/титул) и **не** участвует в авторизации; `User.roleGroup` удаляется на финальной фазе (45-MIGRATION-PLAN.md).

## B.3 Вычисление effective permissions
```text
effective(user):
  roles = UserRole(user) → Role[]            // несколько ролей
  if any(role.isSuperuser) → return WILDCARD  // единственная точка superuser
  allow = ∪ { p | RolePermission(role,p).effect = ALLOW }
  deny  = ∪ { p | RolePermission(role,p).effect = DENY }
  // ALLOW/DENY: решает роль с максимальным priority, у которой есть явная запись для p;
  // при равном priority DENY побеждает. Без DENY-записей = простое объединение.
  return resolve(allow, deny)
can(user, key) = effective ⊇ key (или WILDCARD)
```
**Решение по ALLOW/DENY/INHERIT:** на старте включается только ALLOW (простое объединение); поле `effect` и алгоритм разрешения по priority закладываются сразу, чтобы DENY можно было включить без миграции данных. INHERIT как отдельное значение не нужен: отсутствие записи = inherit.

## B.4 Иерархические правила (priority)
- `actor.maxPriority` = максимум по ролям актёра (superuser — `∞`).
- Действие над пользователем-целью (`ban`, `edit`, `assign role`) разрешено только если `actor.maxPriority > target.maxPriority` (superuser — всегда, кроме защищённых системных аккаунтов).
- Редактировать роль можно только если `role.priority < actor.maxPriority`.
- Выдавать permission можно только если он есть у самого актёра (или актёр superuser).
- Выдавать роль можно только если `role.priority < actor.maxPriority` и `role.isAssignable`.
- Нельзя повысить пользователя выше себя; нельзя снять/изменить роль у защищённого аккаунта (`#0`).
- `isSystem` роли: нельзя удалить, нельзя переименовать slug; права редактируются только superuser.

## B.5 Кеш и инвалидация
Effective permissions допустимо кешировать в Redis: `perm:user:{userId}` (TTL ≤ 300 с). Немедленная инвалидация (`DEL`) обязательна при: изменении `RolePermission`, выдаче/снятии `UserRole`, удалении роли, смене `priority` роли (для затронутых пользователей — через `perm:role-users:{roleId}`). Проверка на каждый запрос берёт данные из кеша, а не из JWT; JWT содержит только `sub`. Так отзыв права действует мгновенно.

## B.6 Страницы и меню
Меню админки формируется из effective permissions: раздел виден, если есть любой `<module>.*.view`. Права страниц: `/admin/users` → `users.view`; `/admin/roles` → `roles.view`; `/admin/roles/:id/edit` → `roles.edit`; `/admin/permissions` → `permissions.manage`; `/admin/audit-log` → `audit.view`. Backend независимо проверяет каждый API-вызов.

## B.7 Новые admin endpoints (PROPOSED)
`GET/POST /admin/roles`, `GET/PATCH/DELETE /admin/roles/:id`, `PUT /admin/roles/:id/permissions`, `GET /admin/permissions`, `POST/DELETE /admin/users/:id/roles/:roleId`, `GET /admin/users/:id/effective-permissions`, `GET /admin/roles/:id/history`. Permissions: `roles.view|create|edit|delete|assign`, `permissions.manage`, `roles.history.view`. Каждая мутация пишет `AuditLog` (severity `critical`).

## B.8 Маппинг миграции
| Сейчас | Новая роль (по умолчанию) |
|---|---|
| Position `Owner`, `Chief Curator`, `Chief Developer` | superuser-роли `Owner`, `Chief Curator`, `Chief Developer` |
| Остальные 5 позиций группы `OWNER` (`Senior Curator`, `Curator`, `Head PR Manager`, `Chief Technical Administrator`, `Head Developer`) | обычные роли с набором permissions, эквивалентным текущему OWNER, **за вычетом** wildcard — для сохранения поведения; затем урезаются владельцем |
| Группа `ADMIN` / `MODERATOR` / `HELPER` | роли с permissions по 11-PERMISSION-MATRIX.md (колонка «Текущий min RoleGroup») |
| `PLAYER` | базовая роль без staff-permissions |
