# PHASE 04 — Database foundation

## Сделано

- Прочитана полностью `docs/technical/07-DATABASE.md` (3389 строк, 105 моделей,
  51 enum) и `08-DATABASE-RELATIONS.md` (421 строка, карта связей) — основа для
  `apps/api/prisma/schema.prisma`.
- Написана полная Prisma-схема: **108 моделей**, **53 enum**. Отличия от
  источника (все — по решениям `DECISIONS.md`):
  - Удалён `enum RoleGroup` и `User.roleGroup` — заменено RBAC (ADR-0004):
    `Role`, `Permission`, `RolePermission` (+`enum PermissionEffect`),
    `UserRole`, `RoleAssignmentLog`.
  - `Position.group`: было `RoleGroup`, стало свободный `String` (чистая
    косметика, без привязки к авторизации).
  - `User`: добавлены `accountType` (`enum AccountType`) и
    `mustChangePassword` (ADR-0006, bootstrap-аккаунты); индекс
    `@@index([roleGroup, isBanned])` заменён на `@@index([isBanned])` +
    `@@index([accountType])`.
  - `Order`: добавлены `paymentProvider`, `paymentWebhookVerifiedAt` (ADR-0009).
  - Добавлена модель `File` + `enum FileStatus` (ADR-0008, CDN).
  - **Не перенесены** (см. `COVERAGE.md`, решение зафиксировано ещё в PHASE 00):
    `ChatMessageReaction` (реакции в чате убраны из продукта — явно
    задокументировано в источнике как unused), `GameReport`, `GamePunishment`
    (внешний bridge TigerReports/LiteBans не описан в задании).
  - Для полей вида `giftToUserId` (CartItem), `actorId`/`userId`
    (RoleAssignmentLog) без документированного `@relation` в источнике —
    оставлены как мягкие ссылки (plain `String`), **без** добавления
    несуществовавшей в источнике FK-связи.
- Разрешена неоднозначность множественных FK на одну модель (обязательно для
  компиляции Prisma): явные `@relation("...")` для `ProfileView`,
  `ProfileReaction`, `ProfileReport`, `Friendship`, `ProfileComment`,
  `Notification`, `Report`, `UserPunishment`, `UserDecoration`, `UserBadge`
  (и его `displayedBy`), плюс самоссылки `Category`, `ChatMessage`,
  `DirectMessage`, `NewsComment`, `ProfileComment`.
- `apps/api`: добавлены `@prisma/client`, `prisma`, `joi`, `@nestjs/config`,
  `dotenv-cli`. Созданы `modules/prisma` (`PrismaService`/`PrismaModule`,
  глобальный модуль) и `modules/health` (`GET /health` — реальный `SELECT 1`
  через Prisma). `ConfigModule.forRoot` с `validationSchema` (`env.validation.ts`)
  — валидируются переменные, которые реально читает код сейчас (`DATABASE_URL`,
  `API_PORT`, `NODE_ENV`); остальные из `.env.example` добавляются в схему по
  мере появления кода, который их использует (`42-TECH-DEBT.md` отмечал
  отсутствие валидации env как проблему — решено сразу, не откладывалось).
  `main.ts` переведён на `ConfigService` (было жёстко `process.env.PORT` —
  не совпадало с `API_PORT` из `.env.example`).

## Проверено реальным запуском (не предполагалось)

1. `pnpm exec prisma generate` — Prisma Client сгенерирован без ошибок.
2. `pnpm exec prisma validate` — схема валидна.
3. `npx dotenv -e ../../.env -- prisma migrate dev --name init` — миграция
   `20261004115235_init` создана и применена к **реальному** Postgres
   (`twomc-su-postgres` из PHASE 03). Проверено напрямую в БД:
   `\dt` → **109 таблиц** (108 моделей + `_prisma_migrations`).
4. `pnpm typecheck && pnpm lint && pnpm build && pnpm test` — все зелёные.
5. `pnpm test:e2e` (с `DATABASE_URL` из `.env`) — **2/2 passed**, включая новый
   `test/health.e2e-spec.ts`: полный NestJS-апп поднимается, `GET /health`
   реально выполняет `SELECT 1` через Prisma к живой БД и возвращает
   `{status:'ok', database:'ok'}`.
6. CI (`ci.yml`) дополнен сервис-контейнером `postgres:16-alpine`, шагом
   `prisma migrate deploy` перед тестами и шагом `pnpm test:e2e` — не запускался
   в этой сессии (GitHub Actions), будет проверен по статусу PR.

## Инцидент при миграции (для будущих похожих ситуаций)

Первая попытка (`pnpm run db:migrate -- --name init`) зависла: `pnpm run` +
`dotenv-cli` со своим `--` дали на выходе двойной `--`, prisma получил битые
аргументы и откатился на интерактивный promt "Enter a name for the new
migration" в фоновом процессе без TTY → вечное ожидание ввода. Диагностировано
по логам Postgres (контейнер был жив, `_prisma_migrations` ожидаемо
отсутствовала при первом запуске) и по списку процессов Windows (3 `node`
процесса с нулевой загрузкой CPU в течение минут = заблокированы на stdin, а
не считают). Исправлено прямым вызовом
`npx dotenv -e ../../.env -- prisma migrate dev --name init` без `pnpm run --`.

## Не входит в эту фазу

- Seed (`prisma/seed.ts`, bootstrap-аккаунты `#0/#1/#2`) — PHASE 32.
- Сервисы/контроллеры поверх моделей — соответствующие доменные фазы (05–21).
- `StorageService`/`File`-pipeline (AVIF, orphan cleanup) — PHASE 23.
