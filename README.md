# twomc.su

Сайт Minecraft-проекта twomc.su: профили и социальная система, чат и личные
сообщения, новости, события, голосования, формы, жалобы и модерация, магазин,
мониторинг Minecraft-серверов, достижения и награды, админ-панель с динамической
системой прав доступа (RBAC).

**Author:** younaxo
**Repository:** https://github.com/younaxo/twomcsu-wsite

## Стек

| Компонент | Технологии |
|---|---|
| `apps/api` | NestJS 10, TypeScript, Prisma 6, PostgreSQL 16, Redis 7, Socket.IO |
| `apps/web` | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, TanStack Query, Zustand, next-intl |
| `packages/shared` | Общие типы/контракты между `api` и `web` (`@twomc/shared`) |

Пакетный менеджер — **pnpm** (workspaces). Полная архитектура — см.
[`docs/implementation/DECISIONS.md`](docs/implementation/DECISIONS.md) и
[`docs/technical/44-TARGET-ARCHITECTURE.md`](docs/technical/44-TARGET-ARCHITECTURE.md).

## Локальный запуск

```bash
pnpm install
cp .env.example .env   # заполнить секреты локально, см. комментарии в файле
pnpm db:up              # поднимает Postgres + Redis (docker compose)
pnpm db:migrate         # применить миграции Prisma (появится в PHASE 04)
pnpm db:seed            # создать bootstrap-аккаунты из ENV (см. ADR-0006)
pnpm dev                 # apps/api (:4000) и apps/web (:3000) параллельно
```

## Команды разработки

```bash
pnpm lint          # ESLint по всем пакетам
pnpm format        # Prettier --write
pnpm format:check  # Prettier --check (используется в CI)
pnpm typecheck     # tsc --noEmit по всем пакетам
pnpm test          # тесты по всем пакетам
pnpm build         # production-сборка всех пакетов
```

## Тестирование

- `apps/api` — Jest + Supertest (unit/integration), отдельная тестовая БД.
- `apps/web` — Vitest + Testing Library (появится вместе с первыми компонентами).
- E2E — Playwright (появится в PHASE 33).

Подробнее — [`docs/implementation/DECISIONS.md`](docs/implementation/DECISIONS.md)
(ADR-0011).

## Архитектура — кратко

- **RBAC** вместо фиксированных ролей: `Role` / `Permission` / `RolePermission` /
  `UserRole`, единственная точка проверки superuser — `PermissionService.isSuperuser`.
  См. ADR-0004, ADR-0005.
- **CDN** — файлы отдаются через `cdn-files.twomc.su`, pipeline sharp → AVIF.
  См. ADR-0008.
- **Платежи** — заказ завершается только подтверждённым вебхуком провайдера,
  без client-triggered «complete»-эндпоинтов. См. ADR-0009.
- **Единый формат ошибок**: `{ statusCode, code, message, details, requestId }`.
  См. ADR-0007.

Полный список архитектурных решений — [`docs/implementation/DECISIONS.md`](docs/implementation/DECISIONS.md).
Статус реализации по фазам — [`docs/implementation/ROADMAP.md`](docs/implementation/ROADMAP.md)
и [`docs/implementation/STATUS.md`](docs/implementation/STATUS.md).

## Документация

| Директория | Содержимое |
|---|---|
| `docs/technical/` | Техпаспорт **предыдущей** версии проекта (реверс-инжиниринг кода) — справочник по бизнес-логике и фактическому поведению |
| `docs/implementation/` | Журнал реализации нового проекта: roadmap, статус, ADR, риски, покрытие |
| `docs/project/` | Итоговая документация нового проекта (появится в PHASE 36): архитектура, API, БД, RBAC, security, деплой |
