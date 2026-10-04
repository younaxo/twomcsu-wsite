# STATUS

Project: twomc.su
Repository: https://github.com/younaxo/twomcsu-wsite

Current phase: PHASE 18 — Minecraft servers
Current branch: feature/minecraft

Completed:
- PHASE 00 — Discovery (документация прочитана, roadmap/decisions/risks созданы)
- PHASE 01 — Project bootstrap (pnpm monorepo: apps/api, apps/web, packages/shared)
- PHASE 02 — CI (GitHub Actions: lint/typecheck/test/build, CodeQL, gitleaks, actionlint, dependabot)
- PHASE 03 — Local infrastructure (Docker Compose: Postgres+Redis, проверено живым запуском)
- PHASE 04 — Database foundation (Prisma schema: 108 моделей/53 enum, миграция
  применена к реальной БД, PrismaModule+HealthModule в NestJS, env-валидация)
- PHASE 05 — Authentication (register/login/refresh-rotation/sessions/change-
  password/forgot-reset-password, brute-force+captcha, бан блокирует сессию
  немедленно — 10 e2e-тестов против реального Postgres+Redis)
- PHASE 06 — RBAC / Permissions (PermissionService, PermissionsGuard, Role/
  Permission CRUD API, priority-иерархия, Redis-кеш effective permissions с
  немедленной инвалидацией, seed 3 superuser-ролей — 7 e2e-тестов)
- PHASE 07 — Users (positions/departments/custom-positions CRUD+assign,
  admin users list+full detail, seed default-позиции — без неё регистрация
  не работала на чистой БД — 5 e2e-тестов)
- PHASE 08 — Profiles (публичный профиль с фильтрацией приватности,
  редактирование профиля, социальные ссылки, выбор декораций — 5 e2e-тестов)
- PHASE 09 — Social system (друзья с полной проверкой policy/блокировок,
  комментарии профиля с реакциями, лента активности с учётом видимости —
  6 e2e-тестов)
- PHASE 10 — Direct Messages (личные/групповые беседы, инвайты, WebSocket-
  гейтвей с аутентификацией через namespace-middleware — 12 e2e-тестов,
  включая реальные Socket.IO-соединения)
- PHASE 11 — Chat (публичные каналы, модерация мут/бан с раздельными
  публичным/приватным payload, WebSocket-гейтвей — 12 e2e-тестов)
- PHASE 12 — Notifications (REST/WS/email/push/discord-вебхуки + реальная
  интеграция в friends/comments/activity/direct-messages/chat — 10 e2e-тестов)
- PHASE 13 — News (публичный CRUD/лайки/комментарии/RSS, admin CRUD+
  модерация, интеграция с уведомлениями — 11 e2e-тестов)
- PHASE 14 — Events / Topics / Voting / Streaming (4 независимых домена,
  27 permission-ключей, видимость через permissions вместо RoleGroup,
  bcrypt-секрет voting webhook, честный refresh без Twitch/YouTube
  credentials — 21 e2e-тест)
- PHASE 15 — Forms (конструктор форм с 33 типами полей, диспетчеризация
  валидации по типу, реальная referential-проверка NEWS_REFERENCE/
  TOPIC_REFERENCE/FRIENDS_SELECTOR, публикация/видимость/лимиты/invite-only/
  черновики — 17 e2e-тестов)
- PHASE 16 — Reports / Moderation (quick moderation mute/warn/kick/ban с
  мгновенным эффектом бана и разрывом сессий при kick, hard-delete сообщений
  чата/комментариев профиля, рассмотрение жалоб на комментарии/профили,
  тикет-система обращений с ролевой видимостью/lock/заметками модератора,
  report-ban отдельно от account-бана, история наказаний — 32 e2e-теста)
- PHASE 17 — Store (каталог/варианты/наборы, bulk+loyalty+promo скидки с
  единым пересчётом сервером, корзина с подарками, PaymentProvider+
  TestPaymentProvider с вебхук-подтверждением (секрет в теле, constant-time,
  идемпотентно), quick-buy анонимный с guestMinecraftNick, wishlist с gift,
  admin статистика с реальной SQL-агрегацией — 21 e2e-тест)

In progress:
- PHASE 18 — Minecraft servers

Blocked:
none (см. RISKS.md для внешних зависимостей, не блокирующих независимую работу;
R11 — найдены чужие старые Docker volumes, не удалены, требуется решение владельца)

## История веток (normalized, см. RISKS.md R12)

PHASE 00–07 изначально велись в одной ветке (`feature/project-bootstrap`).
Ниже — historical branches, задним числом указывающие на commit завершения
каждого этапа (созданы как обычные branch pointers, без переписывания
истории — см. RISKS.md R12 про единственную неоднозначную границу
PHASE 04/05).

| PHASE | Branch | Last commit | Status |
|---|---|---|---|
| PHASE 00–01 — Discovery, Project bootstrap | `feature/project-bootstrap` | `7a6779e` | completed |
| PHASE 02–03 — CI, Local infrastructure | `feature/infrastructure` | `331ff09` | completed |
| PHASE 04 — Database foundation | `feature/database-foundation` | `2346864` | completed |
| PHASE 05 — Authentication | `feature/authentication` | `d5e05b8` | completed |
| PHASE 06 — RBAC / Permissions | `feature/rbac-permissions` | `81699a7` | completed |
| PHASE 07 — Users | `feature/users` | `4bee251` | completed |
| PHASE 08 — Profiles | `feature/profiles` | merged (PR #18) | completed |
| PHASE 09 — Social system | `feature/social-system` | merged (PR #19, `a63af67`) | completed |
| PHASE 10 — Direct Messages | `feature/direct-messages` | merged (PR #20, `2c9ddba`) | completed |
| PHASE 11 — Chat | `feature/chat` | merged (PR #21, `5b25b80`) | completed |
| PHASE 12 — Notifications | `feature/notifications` | merged (PR #22, `b49866d`) | completed |
| PHASE 13 — News | `feature/news` | merged (PR #23, `e3d8035`) | completed |
| PHASE 14 — Events / Topics / Voting / Streaming | `feature/events` | merged (PR #24, `927fe35`) | completed |
| PHASE 15 — Forms | `feature/forms` | merged (PR #25, `b44caa8`) | completed |
| PHASE 16 — Reports / Moderation | `feature/reports-moderation` | merged (PR #26, `687cd20`) | completed |
| PHASE 17 — Store | `feature/store` | merged (PR #27, `20b2dac`) | completed |
| PHASE 18 — Minecraft servers | `feature/minecraft` | *(в работе)* | in progress |

`feature/project-bootstrap` сохранена как есть (указывает на `4bee251`, все
коммиты PHASE 00–07 до нормализации) — согласно прямому указанию не удалять
и не менять её при нормализации. Начиная с PHASE 08 каждая фаза ведётся в
собственной ветке от актуального `main`, по нормальному workflow (branch →
commits → push → PR → CI → merge), без накопления нескольких фаз в одной
ветке; ни одна feature-ветка после merge не удаляется.

Checks (из корня монорепо, локально):
lint: pass
format:check: pass
typecheck: pass
tests: pass (unit 1/1, e2e 20 suite / 157 тестов — auth + RBAC + users-domain +
profiles + social + direct-messages + chat + notifications + news + events +
topics + voting + streaming + forms + moderation + reports + store-catalog +
store-checkout, против реального Postgres+Redis, полный параллельный прогон
всего сьюта)
build: pass

Last updated: 2026-10-04
