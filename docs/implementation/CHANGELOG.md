# CHANGELOG

Формат: по факту реализованных и смёрженных в `main` функций. Ничего
"запланированного" сюда не добавляется — см. `ROADMAP.md`.

## [Unreleased]

### Infrastructure
- Инициализирован pnpm monorepo: `apps/api` (NestJS 10), `apps/web` (Next.js 14 +
  Tailwind CSS), `packages/shared` (`@twomc/shared`).
- Единые команды из корня: `lint`, `format`, `format:check`, `typecheck`, `test`,
  `build`, `dev` — все проверки зелёные.
- CI (GitHub Actions): lint/format/typecheck/test/build, CodeQL, gitleaks,
  actionlint, dependabot.
- `infrastructure/docker-compose.yml`: Postgres 16 + Redis 7 с healthcheck —
  проверено реальным запуском (`pnpm db:up`), оба сервиса `healthy`.

### Database
- Prisma-схема (`apps/api/prisma/schema.prisma`): 108 моделей, 53 enum, первая
  миграция (`20261004115235_init`) применена к реальной БД (проверено: 109
  таблиц, включая `_prisma_migrations`).
- `PrismaModule`/`PrismaService`, `GET /health` (реальная проверка БД через
  Prisma), `ConfigModule` с валидацией env (`DATABASE_URL`, `API_PORT`,
  `NODE_ENV`).

### Authentication
- `POST /auth/register|login|refresh|logout`, `GET/DELETE /auth/sessions`,
  `DELETE /auth/sessions/:id`, `POST /auth/change-password`, `GET /auth/me`,
  `POST /auth/forgot-password|reset-password`.
- JWT access-token (15 мин, payload только `sub`), refresh-token с ротацией и
  reuse detection (повторное использование отозванного токена → отзыв всех
  сессий пользователя). Бан блокирует доступ и refresh немедленно.
- Brute-force (Redis, по IP): captcha после 3 неудачных попыток, блокировка
  на 15 минут (429) после 10.
- `RedisService`, `EmailService` (SMTP, опционально — без `SMTP_HOST` письма
  только логируются).
- helmet, cookie-parser, глобальный `ValidationPipe`, CORS, `ThrottlerModule`
  (100/60с глобально, 10/мин на login).

### RBAC
- `PermissionService` (effective permissions, superuser, priority-иерархия,
  Redis-кеш `perm:user:{id}` с немедленной инвалидацией), `PermissionsGuard`,
  `@RequirePermissions(...)`.
- `GET/POST /admin/roles`, `GET/PATCH/DELETE /admin/roles/:id`,
  `PUT /admin/roles/:id/permissions`, `GET /admin/roles/:id/history`,
  `GET /admin/permissions`, `POST/DELETE /admin/users/:id/roles/:roleId`,
  `GET /admin/users/:id/effective-permissions`.
- Seed: 3 superuser-роли (`Owner`, `Chief Curator`, `Chief Developer`), 7
  permission keys модуля `roles`.

### Users
- Позиции (`/positions`, `/positions/manage`, CRUD + assign), отделы
  (`/admin/departments`, CRUD + assign/reorder), кастомные должности
  (`/admin/custom-positions`, CRUD + assign 1:1), админский список и карточка
  пользователя (`/admin/users`, `/admin/users/:id/full`).
- Seed: базовая позиция `Default` — без неё регистрация не работала на
  чистой БД.
