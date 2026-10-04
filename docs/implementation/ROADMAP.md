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
- [x] PHASE 03 — Local infrastructure (Docker Compose: Postgres, Redis)
- [x] PHASE 04 — Database foundation (Prisma schema, migrations)

## Платформа и безопасность

- [x] PHASE 05 — Authentication (регистрация, вход, refresh rotation, сессии)
- [x] PHASE 06 — RBAC / Permissions (Role/Permission/RolePermission/UserRole)
- [x] PHASE 07 — Users (учётные записи, статусы, departments/positions)
- [x] PHASE 08 — Profiles (публичный профиль, приватность, декорации)
- [x] PHASE 09 — Social system (друзья, комментарии, реакции, activity feed)
- [x] PHASE 10 — Direct Messages (беседы, WebSocket, непрочитанные)
- [x] PHASE 11 — Chat (каналы, модерация, WebSocket; anti-spam/rate-limit — PHASE 26)
- [x] PHASE 12 — Notifications (website/WS/email/push; периодический digest — PHASE 29)
- [x] PHASE 13 — News (черновики, публикация, комментарии; медиа-загрузка — PHASE 23)
- [x] PHASE 14 — Events / Topics / Voting / Streaming (реальный опрос Twitch/YouTube ждёт credentials — RISKS.md R6)
- [x] PHASE 15 — Forms engine (конструктор форм, submissions; экспорт/шаблоны/upload — см. PHASE 15 doc)
- [x] PHASE 16 — Reports / Moderation (жалобы, наказания; audit log — отдельно PHASE 22)
- [x] PHASE 17 — Store (каталог, корзина, заказы, промокоды; реальный провайдер — RISKS.md R2; доставка на сервер не предусмотрена схемой — ADR-0041)
- [x] PHASE 18 — Minecraft servers (реальный Server List Ping, мониторинг, статус, история; RCON не предусмотрен схемой — ADR-0041)
- [x] PHASE 19 — Gamification (achievements с реальным пересчётом прогресса, awards, badges, leaderboards; admin-дашборд — PHASE 20)
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
