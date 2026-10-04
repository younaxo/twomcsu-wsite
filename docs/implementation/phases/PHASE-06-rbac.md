# PHASE 06 — RBAC / Permissions

## Сделано

- `modules/roles/permission.service.ts` — единственная точка вычисления
  `isSuperuser`/effective permissions/priority-иерархии (ADR-0004):
  - `getEffectivePermissions(userId)` — union ALLOW-прав по всем ролям
    пользователя, кеш в Redis `perm:user:{id}` (TTL 300 с), обратный индекс
    `perm:role-users:{roleId}` для массовой инвалидации при изменении роли.
  - `isSuperuser`, `hasPermission`, `hasAllPermissions`, `getMaxPriority`
    (`Infinity` для superuser, `-Infinity` при отсутствии ролей).
  - `canActOn(actorId, targetId)` — `actor.maxPriority > target.maxPriority`;
    защищённый системный аккаунт (`accountType=SYSTEM`) никогда не может быть
    целью, даже для superuser (ADR-0006).
  - `invalidateUser`/`invalidateRole` — немедленный `DEL` кеша.
- `@RequirePermissions(...)` + `PermissionsGuard` (после `JwtAuthGuard`,
  требует `req.user`).
- `RolesController` (`/admin/roles`, `/admin/permissions`):
  CRUD ролей, `PUT /admin/roles/:id/permissions`, `GET /admin/roles/:id/history`.
  Правила из `10-RBAC-PERMISSIONS.md` §B.4 применены буквально: нельзя
  создать/редактировать/удалить роль с `priority >= actor.maxPriority`;
  `isSystem`-роль нельзя удалить и её права может менять только superuser;
  выдать роли permission можно только если он есть у самого актёра (или
  актёр superuser).
- `UserRolesController` (`/admin/users/:userId/roles/:roleId`,
  `/admin/users/:userId/effective-permissions`): assign/revoke с той же
  priority-проверкой + `canActOn`, пишет `RoleAssignmentLog`
  (`GRANTED`/`REVOKED`).
- `prisma/seed/` (permissions.ts, roles.ts, index.ts) — идемпотентный seed:
  7 permission keys модуля `roles`, 3 superuser-роли (`Owner`, `Chief Curator`,
  `Chief Developer` — `isSuperuser=true`, `isSystem=true`). Остальные staff-роли
  и остальные 239 ключей `11-PERMISSION-MATRIX.md` — по мере реализации
  соответствующих доменных модулей (ADR-0016).
- CI: добавлен шаг `prisma db seed` после `migrate deploy` (нужен для
  e2e-теста "superuser обходит любую проверку" — требует реальную роль `Owner`).

## Проверено реальным запуском

- `pnpm run db:seed` дважды подряд против реальной БД — идемпотентно
  (7 permissions / 3 роли, без дублей и ошибок).
- `apps/api/test/roles.e2e-spec.ts` — **7 тестов**, все против реального
  Postgres+Redis (чеклист MASTER PROMPT §95 — RBAC tests):
  - нет permission → 403, есть permission → 200;
  - без токена → 401;
  - superuser (реальная роль `Owner` из seed) обходит любую проверку;
  - **отзыв роли мгновенно убирает доступ** — прямая проверка инвалидации
    Redis-кеша (не ожидание истечения TTL);
  - нижестоящий по priority не может редактировать/удалять роль выше или
    равную своему priority, но может — ниже;
  - системную (`isSystem`) роль нельзя удалить даже с правом `roles.delete`;
  - нельзя выдать роли permission, которого нет у самого актёра
    (`permissions.manage` есть, `roles.delete` — нет → 403 при попытке
    выдать `roles.delete`; `roles.view`, который есть у актёра, — 200).
- Полный набор из корня: `pnpm lint && pnpm format:check && pnpm typecheck &&
  pnpm build && pnpm test && pnpm test:e2e` (4 e2e suite, 17 тестов) — все
  зелёные.

## Не входит в эту фазу

- `DENY`-эффект в разрешении конфликтов (поле `RolePermission.effect` в схеме
  есть с PHASE 04, резолюция по priority — не реализована, см. ADR-0004: "на
  старте только ALLOW").
- Меню/UI на основе permissions — PHASE 31 (frontend).
- Полный реестр 246 permission keys и staff-роли (Admin/Moderator/Helper) —
  появляются по мере доменных фаз и в PHASE 32 (bootstrap) соответственно,
  см. ADR-0016.
