# ROADMAP — twomc.su

Нумерация фаз соответствует MASTER PROMPT (разделы 34–107). Объём каждой фазы
определён документацией в `docs/technical/` (36 backend-модулей, 497 endpoints,
105 Prisma-моделей, 143 страницы — см. `00-README.md`). Статусы обновляются по
факту слияния соответствующей ветки в `main`.

- `[ ]` — не начато
- `[~]` — в работе
- `[x]` — завершено (код + тесты + CI green + merge в main)

## Discovery и инфраструктура

- [x] PHASE 00 — Discovery (репозиторий, документация, архитектурные решения)
- [x] PHASE 01 — Project bootstrap (monorepo, tsconfig, lint, prettier, env)
- [x] PHASE 02 — CI / development infrastructure (GitHub Actions)
- [ ] PHASE 03 — Local infrastructure (Docker Compose: Postgres, Redis)
- [ ] PHASE 04 — Database foundation (Prisma schema, migrations)

## Платформа и безопасность

- [ ] PHASE 05 — Authentication (регистрация, вход, refresh rotation, сессии)
- [ ] PHASE 06 — RBAC / Permissions (Role/Permission/RolePermission/UserRole)
- [ ] PHASE 07 — Users (учётные записи, статусы, departments/positions)
- [ ] PHASE 08 — Profiles (публичный профиль, приватность, декорации)
- [ ] PHASE 09 — Social system (друзья, комментарии, реакции, activity feed)
- [ ] PHASE 10 — Direct Messages (беседы, WebSocket, непрочитанные)
- [ ] PHASE 11 — Chat (каналы, модерация, anti-spam, WebSocket)
- [ ] PHASE 12 — Notifications (website/WS/email/push, digest)
- [ ] PHASE 13 — News (черновики, публикация, комментарии, медиа)
- [ ] PHASE 14 — Events / Topics / Voting / Streaming
- [ ] PHASE 15 — Forms engine (конструктор форм, submissions, экспорт)
- [ ] PHASE 16 — Reports / Moderation (жалобы, наказания, audit)
- [ ] PHASE 17 — Store (каталог, корзина, заказы, промокоды)
- [ ] PHASE 18 — Minecraft servers (мониторинг, статус, история)
- [ ] PHASE 19 — Gamification (achievements, awards, badges, leaderboards)
- [ ] PHASE 20 — Admin backend (административные API, hierarchy, audit)
- [ ] PHASE 21 — Admin panel (frontend, permission-driven меню)
- [ ] PHASE 22 — Audit log (обязательные события, retention)
- [ ] PHASE 23 — CDN / file storage (cdn-files.twomc.su, AVIF pipeline)
- [ ] PHASE 24 — Redis / cache (централизованные ключи, инвалидация)
- [ ] PHASE 25 — System (settings, maintenance, feature flags)
- [ ] PHASE 26 — Security hardening (отдельный security-проход)
- [ ] PHASE 27 — Error system (единый формат ошибок)
- [ ] PHASE 28 — Observability (структурные логи, request id)
- [ ] PHASE 29 — Background jobs (cron, distributed lock, idempotency)
- [ ] PHASE 30 — Frontend API integration (typed client, TanStack Query)

## Контент и запуск

- [ ] PHASE 31 — All pages (143 страницы фронтенда)
- [ ] PHASE 32 — Initial accounts (bootstrap #0/#1/#2 из ENV)
- [ ] PHASE 33 — Testing (unit/integration/e2e/security)
- [ ] PHASE 34 — Performance (N+1, индексы, pagination)
- [ ] PHASE 35 — Production infrastructure (Dockerfile, деплой, backup)
- [ ] PHASE 36 — Final documentation (`docs/project/*`)
- [ ] PHASE 37 — Final audit (`COVERAGE.md`, сверка с docs/technical)

## Примечания по объёму

Старый проект (источник бизнес-требований) — 36 backend-модулей / 73 контроллера /
497 HTTP endpoints / 105 Prisma-моделей / 143 страницы (`docs/technical/00-README.md`).
Это ориентир масштаба для нового проекта, не цель «побайтово повторить». Фазы 09–21
реализуются доменами из этого списка; порядок фаз учитывает зависимости (auth → RBAC →
users → всё остальное) и риски из `45-MIGRATION-PLAN.md`.
