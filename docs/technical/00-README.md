# 00 — twomcsu-website: технический паспорт (индекс)

> Статус документации: **ЧАСТИЧНО ГОТОВА** — см. 49-COVERAGE-REPORT.md. Источник истины — код; README репозитория не использовался как источник фактов.

## Проект
Сайт игрового Minecraft-проекта twomc.su: профили и социальная система, чат и личные сообщения, новости, события, голосования, формы, жалобы и модерация, магазин (оплата на моках), мониторинг Minecraft-серверов, достижения/награды/украшения, админ-панель.

## Состав monorepo (pnpm workspaces)
| Путь | Что | Размер |
|---|---|---|
| `apps/api` | NestJS 10 API + Socket.IO, Prisma 6, PostgreSQL 16, Redis 7 | 323 `.ts`, ~42.7k LOC |
| `apps/web` | Next.js 14 (App Router), React 18, next-intl, Zustand 5, TanStack Query 5, axios, socket.io-client | 512 `.ts/.tsx`, ~55k LOC |
| `packages/shared` | общие типы `@twomc/shared` (контракт API/frontend, `RoleGroup`) | 28 файлов, ~3k LOC |

## Статистика (контрольные числа)
| Показатель | Значение |
|---|---|
| Backend-модули (`apps/api/src/modules`) | 36 (achievements, activity, admin, auth, awards, cache, chat, comments, consent, custom-positions, decorations, departments, direct-messages, emojis, events, export, forms, friends, health, leaderboards, minecraft, moderation, news, notifications, positions, prisma, redis, reports, statistics, store, streaming, system, topics, uploads, users, voting + `store` подмодули) |
| Controller-классы | **73** |
| HTTP endpoints | **497** (GET 202, POST 147, PUT 3, PATCH 72, DELETE 73) |
| WebSocket | 3 namespaces, 19 client→server events |
| Prisma models / enums / migrations | **105 / 51 / 41** |
| Frontend pages (`page.tsx`) | **143** |
| Cron jobs | 12 |
| Proposed permission keys | 246 (47 модулей) |

## Карта документации
Написаны: [03-PAGES](03-PAGES.md) · [04-API-REFERENCE](04-API-REFERENCE.md) · [05-API-MATRIX](05-API-MATRIX.md) · [06-WEBSOCKET](06-WEBSOCKET.md) · [07-DATABASE](07-DATABASE.md) · [08-DATABASE-RELATIONS](08-DATABASE-RELATIONS.md) · [09-AUTHENTICATION](09-AUTHENTICATION.md) · [10-RBAC-PERMISSIONS](10-RBAC-PERMISSIONS.md) · [11-PERMISSION-MATRIX](11-PERMISSION-MATRIX.md) · [25-AUDIT-LOG](25-AUDIT-LOG.md) · [26-CDN-FILES](26-CDN-FILES.md) · [28-CACHE-REDIS](28-CACHE-REDIS.md) · [29-SECURITY](29-SECURITY.md) · [31-BACKGROUND-JOBS](31-BACKGROUND-JOBS.md) · [32-ENVIRONMENT](32-ENVIRONMENT.md) · [33-DEPLOYMENT](33-DEPLOYMENT.md) · [42-TECH-DEBT](42-TECH-DEBT.md) · [43-MISSING-FUNCTIONALITY](43-MISSING-FUNCTIONALITY.md) · [44-TARGET-ARCHITECTURE](44-TARGET-ARCHITECTURE.md) · [45-MIGRATION-PLAN](45-MIGRATION-PLAN.md) · [46-TESTING](46-TESTING.md) · [47-OPEN-QUESTIONS](47-OPEN-QUESTIONS.md) · [01-ARCHITECTURE](01-ARCHITECTURE.md) · [49-COVERAGE-REPORT](49-COVERAGE-REPORT.md).
Не написаны (запланированы): 02, 12–24, 27, 30, 34–41, 48.

## Ключевые технические решения
1. API без глобального префикса и версионирования; авторизация per-controller (`JwtAuthGuard`, `RolesGuard`).
2. Access-JWT (15 м) в памяти клиента + refresh-cookie (httpOnly, rotation, HMAC-хеш в БД).
3. Доступ определяет `User.roleGroup` (5 уровней); `Position` — косметика.
4. Публичный ID `User.shortId` (autoincrement) отдельно от `User.id` (cuid).
5. Redis: кеш чтения, brute-force, presence чата.
6. Файлы — локальный диск, WebP.
7. Realtime — Socket.IO, namespaces `chat`, `messages`, `notifications`.

## Glossary
`RoleGroup` — группа доступа; `Position` — титул/префикс; `shortId` — публичный числовой ID (#N); `tag` — публичный тег `name#xxxx`; `Department` — отдел; `CustomPosition` — кастомная должность.

## Основные находки
См. 29-SECURITY.md: 2 CRITICAL (hardcoded seed-пароли, `mock-complete`), 3 HIGH.
