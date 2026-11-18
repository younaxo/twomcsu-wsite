# Q50: перенос прав заметок обращений (ADR-0174)

## 1. Результат

Статус: DONE (код, тесты, документы). БД, seed, e2e не запускались (Q28, Q43). Ветка fix/q50-notes-perms-backfill от 52d5335; push не выполнялся.

Решение владельца Q50 (б): отдельная миграция данных выдаёт `reports.notes.edit` ролям с `reports.delete` и `reports.notes.unpin` ролям с `reports.notes.pin`; только на одноразовой БД, на production применяет владелец. Порядок: миграция -> seed -> выдача прав (теперь делает миграция, вручную проверка) -> деплой.

## 2. Файлы

- `apps/api/prisma/migrations/20261117010000_reports_notes_permissions_backfill/migration.sql` (новая)
- `apps/api/src/modules/reports/notes-permissions-backfill-migration.spec.ts` (unit, 6 тестов)
- `docs/runbooks/production-env-checklist.md`, `docs/implementation/DECISIONS.md` (ADR-0174), `CHANGELOG.md`, `RISKS.md` (дополнение R40), этот отчёт.

## 3. Проверки

- tsc --noEmit api (test/ входит) и packages/shared: 0 ошибок.
- api `jest --runInBand`: 55 suites, 540 тестов, PASS, из них 6 новых.
- e2e не запускались. Сценарий «после миграции роль со старым правом имеет новое» в e2e не добавлен намеренно: e2e создают роли заново после применения миграций, backfill на них не проверить. Это ручная проверка на одноразовой БД: создать роль с `reports.delete` и роль с `reports.notes.pin` до миграции, применить миграцию, выполнить SELECT из чек-листа (первый запрос — 2 строки, второй и третий — пусто), затем запустить seed и убедиться, что число строк в `permissions` с этими ключами осталось 2.

## 4. Риски и допущения

- id новых прав — `migrated-<key>` (не cuid); seed находит их по `key`, id не меняет. Код с поиском по id в репозитории не найден (статически).
- Роли с `reports.delete` получают правку чужих заметок (прежнее поведение до ADR-0172). Эффективные права не расширяются.
- Явный DENY на новом праве миграция не перезаписывает (конфликт по ключу).
- Выдано вручную раньше: безвредно (ON CONFLICT DO NOTHING); проверка SELECT из чек-листа.

## 5. Миграции для обязательного ревью (Q28)

Одна миграция: `20261117010000_reports_notes_permissions_backfill`. Только INSERT, идемпотентна, не применялась.

```sql
-- Q50, ADR-0174: перенос прав заметок обращений на новые ключи (продолжение ADR-0172).
-- Раньше правка чужих заметок шла по reports.delete, открепление по reports.notes.pin;
-- теперь это reports.notes.edit и reports.notes.unpin. Миграция только добавляет
-- строки и выдаёт новые права ролям, у которых есть соответствующее старое право
-- с effect ALLOW. Запись DENY не копируется. Ничего не удаляется и не меняется.
-- Повторный запуск безопасен (ON CONFLICT DO NOTHING).

-- 1. Каталог прав. id детерминированный (по образцу 'migrated-...' из
-- 20261009150000_site_alert_social_links): cuid() генерирует клиент Prisma,
-- в SQL его нет. Если seed уже создал право, срабатывает конфликт по key (или id)
-- и строка не трогается; seed позже синхронизирует по key и id не меняет.
INSERT INTO "permissions" ("id", "key", "module", "description", "createdAt")
VALUES
  ('migrated-reports.notes.edit', 'reports.notes.edit', 'reports',
   'Правка чужих заметок модератора (автор всегда правит свои)', CURRENT_TIMESTAMP),
  ('migrated-reports.notes.unpin', 'reports.notes.unpin', 'reports',
   'Открепление заметки модератора', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- 2. Выдача: reports.delete -> reports.notes.edit.
INSERT INTO "role_permissions" ("roleId", "permissionId", "effect", "createdAt")
SELECT old_rp."roleId", new_p."id", 'ALLOW', CURRENT_TIMESTAMP
FROM "role_permissions" old_rp
JOIN "permissions" old_p ON old_p."id" = old_rp."permissionId" AND old_p."key" = 'reports.delete'
JOIN "permissions" new_p ON new_p."key" = 'reports.notes.edit'
WHERE old_rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;

-- 3. Выдача: reports.notes.pin -> reports.notes.unpin.
INSERT INTO "role_permissions" ("roleId", "permissionId", "effect", "createdAt")
SELECT old_rp."roleId", new_p."id", 'ALLOW', CURRENT_TIMESTAMP
FROM "role_permissions" old_rp
JOIN "permissions" old_p ON old_p."id" = old_rp."permissionId" AND old_p."key" = 'reports.notes.pin'
JOIN "permissions" new_p ON new_p."key" = 'reports.notes.unpin'
WHERE old_rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
```
