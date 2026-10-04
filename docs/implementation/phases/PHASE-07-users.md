# PHASE 07 — Users

## Сделано

- **Seed:** `prisma/seed/positions.ts` — базовая позиция `Default`
  (`isDefault=true`). Критичная находка: без неё регистрация в свежей БД
  падала (`AuthService.register` требует существования default-позиции), а
  до этой фазы она появлялась только как побочный эффект тестовых фикстур.
  Теперь `pnpm db:seed` делает чистую БД пригодной для регистрации из коробки.
- `modules/positions`: `GET /positions` (публичный, только `isVisible`),
  `GET /positions/manage` (`positions.view`, все), `POST/PATCH/DELETE
  /positions(/:id)` (`positions.create|edit|delete`), `POST
  /positions/:id/assign` (`positions.assign`). Удаление default-позиции
  запрещено явно; удаление позиции, назначенной хотя бы одному пользователю,
  перехватывает FK-violation (`P2003`) и возвращает `409`, а не `500`.
- `modules/departments`: `GET/POST/PATCH/DELETE /admin/departments(/:id)`
  (`departments.view|create|edit|delete`), `POST/DELETE
  /admin/users/:userId/departments/:departmentId`, `PATCH
  /admin/users/:userId/departments/order` (`departments.assign`).
- `modules/custom-positions`: `GET/POST/PATCH/DELETE
  /admin/custom-positions(/:id)` (`custom_positions.view|create|edit|delete`),
  `POST/DELETE /admin/users/:userId/custom-position`
  (`custom_positions.assign`) — одна кастомная должность на пользователя
  (`UserCustomPosition.userId` уникален в схеме), повторное назначение
  заменяет, а не дублирует.
- `modules/users`: `GET /admin/users` (пагинация, поиск по
  username/email/tag, `users.view`), `GET /admin/users/:id/full` (детальная
  карточка: position, departments, customPosition, roles) — без `password` в
  выдаче (явный `select`, а не `include` всей модели).
- 16 новых permission keys добавлены в `prisma/seed/permissions.ts` (ADR-0016
  — по мере реализации модуля, не заранее).

## Реальный баг, найденный тестами

`PositionsModule`/`DepartmentsModule`/`CustomPositionsModule`/`UsersModule`
использовали `PermissionsGuard`/`@RequirePermissions`, но тесты падали на
старте Nest DI: `PermissionService`/`PermissionsGuard` не были доступны вне
`RolesModule` (не `@Global()`, экспортировался только `PermissionService`, не
сам guard). **Исправлено**: `RolesModule` переведён в `@Global()` (по тому же
принципу, что `PrismaModule`/`RedisModule`/`EmailModule`) — права доступа
нужны практически любому будущему доменному модулю, это сквозная
инфраструктура, а не локальная зависимость одного модуля.

## Проверено реальным запуском

`apps/api/test/users-domain.e2e-spec.ts` — **5 тестов** против реального
Postgres+Redis:
- `GET /positions` публично отдаёт seed-позицию `default`;
- создание позиции → назначение пользователю → запрет удаления
  default-позиции (403) → запрет удаления позиции в использовании (409,
  проверка перехвата FK-violation) → успешное удаление после освобождения;
- отдел: создание × 2 → назначение пользователю × 2 → reorder → проверка
  порядка в БД → снятие → удаление;
- кастомная должность: назначение A, затем B → в БД ровно одна запись с
  `customPositionId = B` (замена, не дублирование) → снятие → удаление;
- `GET /admin/users` с поиском/пагинацией не отдаёт `password`;
  `GET /admin/users/:id/full` отдаёт роли/отделы/кастомную должность.

Полный набор из корня (5 e2e suite, 22 теста) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- Бан/мут/кик/предупреждения — PHASE 16 (Moderation), не Users.
- Badges/awards — PHASE 19 (Gamification).
- Публичный профиль, приватность, avatar/banner — PHASE 08 (Profiles).
- `PATCH /admin/users/bulk`, `/admin/users/export` — не реализованы: старая
  реализация `bulk` в основном покрывала moderation-действия (ban), которые
  сознательно вынесены в PHASE 16; экспорт — кросс-cutting PHASE 20.
