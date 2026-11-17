# Отчёт: Q23, выдача роли только в пределах прав выдающего

## 1. Результат

Статус: complete (код, unit-тесты, e2e дописан статически). Ветка fix/q23-role-grant-subset от fix/q22-admin-2fa-always. Решение владельца: «(а): проверять, что права выдаваемой роли входят в права выдающего (кроме владельца)». ADR-0170 (Accepted), R37, запись в CHANGELOG.

`POST /admin/users/:userId/roles/:roleId` теперь после проверок priority и `canActOn` вызывает `PermissionService.assertGrantorCoversRole`. Нарушение даёт 403 `{ code: 'role_permissions_exceed_grantor', message, missing }`.

## 2. Найденные пути выдачи роли

| Путь | Что это | Действие |
| --- | --- | --- |
| `apps/api/src/modules/roles/user-roles.controller.ts:41` (upsert на :85) | единственный рантайм-путь выдачи роли | добавлена проверка подмножества (:77) |
| `user-roles.controller.ts:105` | снятие роли | не менялось (по заданию) |
| `apps/api/src/modules/roles/role-bulk.service.ts:68` | массовое изменение ПРАВ ролей, выдачей роли пользователю не является | уже требует, что добавляемые права есть у редактора (:90); не менялось |
| `apps/api/src/modules/admin/admin-users-bulk.service.ts:33` | массовые ban/unban, ролей не выдаёт | не относится к выдаче |
| `apps/api/prisma/seed/bootstrap.ts:208` | seed-выдача роли системным аккаунтам (запускает владелец) | не рантайм API, не менялось |

Регистрация (`auth.service.ts`), OAuth, приглашения, `roles: { create|connect|set }`: выдачи ролей не найдено (grep по `userRole`, `UserRole`, `roles:`, `assignedBy`, `roleAssignmentLog` по всему `apps/api/src`; `auth.service.ts:670`, `profiles.service.ts:468` и пр. только чтение).

## 3. Определение владельца

Пользователь с назначенной ролью `Role.isSuperuser = true` (`getEffectivePermissions().superuser`, `permission.service.ts:49`). Не priority, не `accountType=SYSTEM`. Wildcard `*` (константа `WILDCARD`) в рантайме не используется; учтён как надмножество у выдающего.

## 4. Изменённые файлы

- `apps/api/src/modules/roles/permission.service.ts` (метод `assertGrantorCoversRole`)
- `apps/api/src/modules/roles/user-roles.controller.ts`
- `apps/api/src/modules/roles/permission.service.spec.ts` (новый, 8 тестов)
- `apps/api/src/modules/roles/user-roles.controller.spec.ts` (новый, 4 теста)
- `apps/api/test/roles.e2e-spec.ts` (кейс «выдача роли: права роли должны входить в права выдающего», не запускался)
- `docs/implementation/DECISIONS.md`, `RISKS.md`, `CHANGELOG.md`, этот отчёт

## 5. Проверки

- `tsc --noEmit -p tsconfig.json` в apps/api (включает test/): PASS, код 0.
- `tsc --noEmit` в packages/shared: PASS, код 0.
- `jest --runInBand` (весь unit-набор api): 50 suites passed / 50, 462 tests passed / 462.
- eslint по `src/modules/roles` и `test/roles.e2e-spec.ts`: 0 замечаний; prettier по изменённым файлам: без изменений.
- e2e не запускались (запрет).

## 6. Риски

- Роли, выданные до изменения, не пересматриваются; данных не меняем, миграций нет.
- Проверка в момент выдачи: если у выдающего потом отняли право, выданная ранее роль остаётся (R37).
- Клиент получает новый 403 с `code`; UI специальной обработки не имеет.

## 7. Вопросы владельцу

1. Редактирование набора прав роли (класс эскалации из п.5 задания): исправлять нечего, проверка уже есть: `roles.controller.ts:185` (PUT `/admin/roles/:id/permissions`) и `role-bulk.service.ts:90` (массовая правка) требуют, чтобы добавляемые права были у редактора, плюс priority роли ниже своего. `PATCH /admin/roles/:id` (`roles.controller.ts:124`) права не меняет. Остаточный нюанс: сравнение без учёта `*` (R37), сейчас практического эффекта нет. Варианты: А, оставить; Б, при появлении wildcard вынести в общий хелпер. Рекомендация Б позже. Ничего не блокирует.
2. Пересмотр уже выданных ролей (аудит несоответствий): вариант А, не делать; Б, разовый read-only отчёт по БД, запускает владелец. Рекомендация А/Б по желанию; не блокирует.
