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

### Profiles
- `GET /users/:username/public` (фильтрация по приватности),
  `GET/PATCH /users/me/profile`, соцсети (`/users/me/social-links`),
  выбор декорации (`/users/me/decoration`, только из принадлежащих).

### Social system
- Друзья: заявки/принятие/отклонение/отмена, список/блокировка,
  `friendRequestPolicy` (включая `FRIENDS_OF_FRIENDS`).
- Комментарии профиля: создание/редактирование/soft-delete, реакции
  (свободный emoji), жалобы; учитывают `commentsEnabled`/`commentPolicy`.
- Лента активности: глобальная (`PUBLIC`) и персональная (с учётом
  `FRIENDS`/`PRIVATE`), реакции и комментарии к активности, персональные
  настройки (`ActivityFeedSettings`). Принятие заявки в друзья создаёт первую
  реальную запись активности (`FRIENDSHIP_STARTED`).

### Direct Messages
- Личные и групповые беседы (`/messages/conversations/*`), идемпотентное
  создание личной беседы (`directKey`), сообщения (отправка/редактирование/
  soft-delete/реакции с несколькими emoji на пользователя), `markRead` с
  unread count, выход из беседы, инвайты в группы (код/`maxUses`/`expiresAt`).
  `directMessagePolicy` (`EVERYONE`/`FRIENDS`/`FRIENDS_OF_FRIENDS`/`NOBODY`)
  соблюдается полностью.
- `DirectMessagesGateway` (Socket.IO, namespace `/messages`): auto-join комнат
  участника при подключении, `conversation:join/leave`, `message:send`
  (ack + broadcast), `message:edit/delete/react` → `message:updated`,
  `conversation:read` → receipt, `typing:start/stop`. Аутентификация — через
  Socket.IO namespace-middleware (не `handleConnection`) — иначе возможна
  гонка между подключением и первым событием клиента (поймано e2e-тестом).
- `ConfigurableIoAdapter`: CORS для всех WS namespace настраивается централизованно
  через `ConfigService`, а не статической опцией в `@WebSocketGateway` —
  устраняет для всего приложения проблему старого проекта (S11:
  `/messages` с `cors.origin=true`).

### Chat
- Публичный `/chat/*` (список каналов, история, онлайн, закреплённые) и
  `/admin/chat/*` под permissions (CRUD каналов, мут/бан листинг-снятие,
  поиск по сообщениям). Отправка сообщений — только через WebSocket.
- `ChatGateway` (Socket.IO, namespace `/chat`): `join/leave_channel` с
  presence в Redis, `send/edit/delete_message`, `typing_start/stop`,
  `pin_message`, `mute_user`/`ban_user` — публично без причины, причина и
  детали уходят только в личную комнату цели (в отличие от старого проекта,
  S12). Чат-бан проверяется при подключении и блокирует весь namespace.

### Notifications
- `/notifications/*` (список/unread-count/read/read-all/remove, settings,
  push subscribe/unsubscribe, личный Discord-вебхук, digest test) и
  `/admin/notifications/*` (CRUD системных Discord-вебхуков, broadcast,
  stats) под permissions.
- `NotificationsGateway` (Socket.IO, namespace `/notifications`, только
  server→client): `notification:new` в реальном времени.
- Email (PHASE 05) и push (`web-push`, молча выключается без VAPID-ключей)
  каналы доставки с учётом `quietHours`/`digestMode`; личный и системные
  Discord-вебхуки с allowlist домена против SSRF.
- Реальная межмодульная интеграция: друзья, комментарии профиля, комментарии
  активности (новые типы `ACTIVITY_COMMENT`/`ACTIVITY_COMMENT_MENTION`),
  личные сообщения и упоминания в чате теперь создают уведомления через
  единую точку `NotificationsService.create()`.
