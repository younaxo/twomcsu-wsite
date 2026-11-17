# Отчёт: этап 02, срез 1 — ядро наказаний (2026-11-17)

Ветка `feature/stage-02-s1-punishments-core`. Дизайн: `docs/stage-02/LITEBANS-INTEGRATION-DESIGN.md`, ADR-0166, ADR-0178. Ничего не запушено, миграция не применялась, БД, Docker и e2e не запускались.

## Что сделано

- К1 (5c5d212): контракт `PunishmentSource`, типы и ошибки источника, статус (`computePunishmentStatus`), очистка текстов (`sanitizeText`, `sanitizeReason`, `sanitizeLabel`), нормализация строки и `rowHash`.
- К2 (1508543): модели Prisma и миграция, `PunishmentMirrorStore` и реализация на Prisma, `PunishmentsSyncService` (слои 0, 1, 2, 3, T), `LeaderLock` на Redis, `PunishmentsScheduler`, `PunishmentsModule` (зарегистрирован в `AppModule`, без источника не имеет побочных эффектов), `LITEBANS_*` в валидации env, тесты.
- К3: ADR-0178, CHANGELOG, RISKS (R52-R55), этот отчёт.

## Срезы 2-3 (не сделаны)

- Срез 2: адаптер LiteBans на `mysql2` (новая зависимость и lockfile, нужно решение владельца и ресурсы), чтение `history` для ников, подстановка под `PUNISHMENT_SOURCE`.
- Срез 3: HTTP API, страница `/bans`, «Мои наказания», WebSocket-рассылка (`onChange` уже есть, подписчика нет), админ-управление (скрытие `isHidden`).

## Миграции для обязательного ревью (Q28)

1. `apps/api/prisma/migrations/20261117020000_punishments_mirror/migration.sql`: два `CREATE TYPE`, две `CREATE TABLE` (`minecraft_punishments`, `punishment_sync_state`), пять индексов (три обычных, два уникальных). Деструктивных операций нет, существующие таблицы не затронуты. Написана вручную, соответствует `schema.prisma` по сверке текста, на БД не применялась; `prisma generate` выполнен (клиент собирается, `tsc` проходит). Сырой SQL upsert не проверен на PostgreSQL (R52).

## Очистка и тесты обхода

Функции: `sanitizeText`, `sanitizeReason`, `sanitizeLabel`, `normalizeSourceString`, `normalizeUuid`, `normalizeActor`. Тесты обхода в `text-sanitizer.spec.ts` (цветовые коды, управляющие и bidi-символы, IPv4, IPv6, e-mail, URL и домены, телефоны, контактные идентификаторы, комбинации) и `normalize-punishment.spec.ts`.

## Проверки

- `tsc --noEmit` api (включая `test/`): без ошибок. Shared: без ошибок.
- `jest --runInBand` api целиком: см. итоговую строку в handback.
- eslint и prettier по изменённым файлам: чисто.

## Риски

R52-R55 в `docs/implementation/RISKS.md`. Главный: сырой SQL и миграция не прогонялись на PostgreSQL.

## Решения владельца

Нужны: ревью миграции (Q28), затем применение на одноразовой БД; для среза 2 — доступ к БД LiteBans, ресурсы и разрешение на зависимость `mysql2`.
