# DECISIONS — архитектурные решения (ADR)

## ADR-0001 — Целевая архитектура вместо фактической реализации старого проекта

**Context.** `docs/technical/` описывает **старый** проект twomc.su: 01-ARCHITECTURE —
факт по коду, 44-TARGET-ARCHITECTURE — предложенное целевое состояние (RBAC,
CDN+AVIF, secure bootstrap, нормализованные ошибки, audit, реальные платежи).
42-TECH-DEBT и 29-SECURITY фиксируют известные проблемы старой реализации
(hardcoded seed-пароли, mock-оплата, RoleGroup вместо permissions и т.д.).

**Decision.** Новый проект строится по `44-TARGET-ARCHITECTURE.md` и части B
`10-RBAC-PERMISSIONS.md`/`11-PERMISSION-MATRIX.md` как по целевому состоянию,
а не по части A (факт старого кода). Бизнес-правила, доменная модель, список
функций, endpoints и страниц берутся из фактической документации (01, 03, 04,
05, 07, 08, 09, 25, 26, 28, 31) как справочник требований. Технический долг и
security-находки старого проекта **не переносятся**.

**Consequences.** `RoleGroup` enum не используется вообще (ADR-0003). Миграционные
шаги 45-MIGRATION-PLAN.md (dual-mode, data-migration `roleGroup→UserRole`)
неприменимы — пишем сразу целевую схему.

## ADR-0002 — Технологический стек и структура монорепозитория

**Decision.** pnpm workspaces: `apps/api` (NestJS 10, TypeScript), `apps/web`
(Next.js 14 App Router, React, next-intl, TanStack Query, Zustand), `packages/shared`
(общие типы и контракты). PostgreSQL 16 + Prisma 6, Redis 7, Socket.IO для realtime.
Решение соответствует MASTER PROMPT §32 и фактическому стеку старого проекта
(подтверждает применимость для требуемой функциональности).

## ADR-0003 — Идентификаторы: cuid + публичный numeric ID

**Decision.** Внутренний `id` — `cuid()` (устойчив к перечислению, не раскрывает
порядок создания). Публичный ID — отдельное поле `shortId Int @unique` (autoincrement
через sequence, кроме зарезервированного `0` для системного аккаунта — явная вставка,
см. ADR-0006). `RoleGroup` как способ авторизации не создаётся: доступ полностью
на Role/Permission (ADR-0004).

## ADR-0004 — RBAC: Role / Permission / RolePermission / UserRole

**Decision.** Реализуется схема B из `10-RBAC-PERMISSIONS.md`:
`Role(priority, isSystem, isSuperuser, isAssignable)`, `Permission(key, module)`,
`RolePermission(effect: ALLOW|DENY)`, `UserRole`, `RoleAssignmentLog`. Единственная
точка проверки superuser — `PermissionService.isSuperuser(user)` (роли `Owner`,
`Chief Curator`, `Chief Developer`, флаг `isSuperuser=true`). Авторизация —
`@RequirePermissions('module.action')` + `PermissionsGuard`, никаких `if (role === 'OWNER')`
вне `PermissionService`. Эффективные права вычисляются и кешируются в Redis
(`perm:user:{id}`, TTL ≤ 300 с), с немедленной инвалидацией при изменении ролей/прав
(10-RBAC-PERMISSIONS.md §B.5). На старте поддерживается только `ALLOW` (простое
объединение по ролям пользователя), поле `effect` и priority-резолюция закладываются
в схему сразу, чтобы включить `DENY` без миграции данных (как рекомендовано в
документе-источнике).

Priority-иерархия: `actor.maxPriority > target.maxPriority` для действий над
пользователем (ban/edit/assign role); защищённые системные роли (`isSystem=true`)
нельзя удалить/переименовать, их права редактирует только superuser.

**Реестр permission keys.** Базовый реестр берётся из `11-PERMISSION-MATRIX.md`
(246 ключей, 47 модулей) с исправлением артефактов автогенерации, отмеченных в
документе (`misc.view`→`dashboard.view`, `overview.view`→`dashboard.overview.view`,
`content.view`→`dashboard.content.view`, `charts.*`→`dashboard.charts.*`,
`modules.edit`→`system.modules.edit`). Формат ключей — `<module>.<resource>.<action>`.

## ADR-0005 — Роли по умолчанию (seed) для staff вне superuser

**Context.** `47-OPEN-QUESTIONS.md` №1–2: в старом проекте 8 позиций группы OWNER
имели полный доступ; задание (MASTER PROMPT §44) требует, чтобы полный доступ
(wildcard) имели только Owner/Chief Curator/Chief Developer.

**Decision.** Seed создаёт роли `Owner`, `Chief Curator`, `Chief Developer`
(`isSuperuser=true`) и дополнительно staff-роли уровня ADMIN/MODERATOR/HELPER с
**явным** набором permissions, равным колонке «Текущий min RoleGroup» из
`11-PERMISSION-MATRIX.md` (т.е. поведение эквивалентно старой системе), но **без**
wildcard — только явные ключи. Бывшие 5 OWNER-позиций (`Senior Curator`, `Curator`,
`Head PR Manager`, `Chief Technical Administrator`, `Head Developer`) получают
такой же явный набор, что и у роли, замещающей прежний `ADMIN`+OWNER-only разделы
(`departments.*`, `custom_positions.*`, `positions.create/edit/delete`, `topics.*`,
`awards.*`, `support.donations.view`) — без wildcard. Дальнейшая настройка — через
редактор ролей (owner может урезать/расширить).

## ADR-0006 — Secure bootstrap accounts

**Decision.** Реализуется по `44-TARGET-ARCHITECTURE.md` §5: `#0` (SYSTEM,
`shortId=0`, явная вставка, вход по паролю запрещён, защищён от delete/ban/rename),
`#1` (Owner), `#2` (Chief Curator). Пароли только из `BOOTSTRAP_SYSTEM_PASSWORD`,
`BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_CHIEF_CURATOR_PASSWORD` — без ENV аккаунты
**не создаются** (seed завершается с ошибкой, если `NODE_ENV=production` и
переменные отсутствуют). `mustChangePassword=true` для #1/#2. Аккаунт `#3` (dizikk,
Senior Curator) в bootstrap не входит (MASTER PROMPT §92 требует только #0/#1/#2;
подтверждено `47-OPEN-QUESTIONS.md` №8).

## ADR-0007 — Единый формат ошибок

**Decision.** Глобальный `ExceptionFilter`: `{ statusCode, code, message, details, requestId }`.
`requestId` — генерируется middleware (uuid), прокидывается в логи. Production
не возвращает stack trace/SQL/внутренние пути.

## ADR-0008 — Файловое хранилище и CDN

**Decision.** Реализуется схема B из `26-CDN-FILES.md`: модель `File(key, mime, size,
uploaderId, ownerType, ownerId, status: TEMP|ATTACHED|DELETED)`, `StorageService` с
драйверами `local` (dev) и `s3` (production, S3-совместимое хранилище) за
`CDN_BASE_URL=https://cdn-files.twomc.su`. Клиент передаёт только `uploadType`,
backend сам формирует ключ (`users/{userId}/avatar/{uuid}.avif` и т.д., см. раздел
«Структура ключей» в 26-CDN-FILES.md). Pipeline: magic-bytes sniff (`file-type`) →
sharp decode → strip EXIF → resize по пресету → AVIF (quality ≈ 55–60) — кроме
анимированных GIF/WebP (не конвертируются) и SVG (только после sanitize). Orphan
cleanup — cron, `TEMP` старше 24 ч.

**Risk.** Реальные S3-совместимые credentials — внешний блокер, см. `RISKS.md`.
Локальный драйвер реализуется полностью рабочим для dev/тестов.

## ADR-0009 — Платежи

**Context.** `47-OPEN-QUESTIONS.md` №6 — провайдер не выбран; старая реализация
использовала `mock-complete` (CRITICAL, S2 в `29-SECURITY.md`) — заказ завершается
без проверки оплаты.

**Decision.** Вводится интерфейс `PaymentProvider` (создание платежа, проверка
подписи вебхука, статус). Заказ переходит в `COMPLETED` **только** через вебхук
провайдера с проверенной подписью — никакого client-triggered «complete»-эндпоинта
в проекте нет вообще (в т.ч. в dev/test — тестовый провайдер эмулирует вебхук
локально через отдельный CLI/скрипт, а не публичный API). До выбора и подключения
реального провайдера (внешний блокер, см. `RISKS.md`) модуль работает с
`TestPaymentProvider`, который создаёт платёж в состоянии `PENDING` и не позволяет
завершить заказ без вызова его внутреннего webhook-симулятора, недоступного извне
production-сборки (`NODE_ENV=production` отключает регистрацию тестового провайдера).
Деньги — `Decimal`/целые minor units, никогда `float`. Итог заказа всегда
пересчитывается сервером (цена, скидки, промокод, бандл).

## ADR-0010 — Единый формат admin-панели (без дублирования /admin и /dashboard)

**Context.** `47-OPEN-QUESTIONS.md` №3: в старом проекте `/dashboard/*` (OWNER) и
`/admin/*` (ADMIN) частично дублируют одни и те же разделы (store stats, loyalty,
currencies, audit-log).

**Decision.** Новый проект не воспроизводит это дублирование: единая админ-панель
`/admin`, видимость разделов определяется effective permissions (не ролью/путём).
Нет отдельного `/dashboard` для Owner — Owner видит те же разделы `/admin` плюс
owner-only разделы (department/custom-position/topics и т.п.), которые скрыты от
пользователей без соответствующих permissions.

## ADR-0011 — Тестовый стек

**Decision.** `apps/api`: Jest + Supertest, тестовая БД через Prisma migrate,
тестовый Redis-инстанс. `apps/web`: Vitest + Testing Library. E2E: Playwright.
WebSocket: `socket.io-client` внутри Jest. Обязательные наборы — см.
`docs/technical/46-TESTING.md` (перенесены в `COVERAGE.md` как чеклист).

## ADR-0012 — Стилизация frontend: Tailwind CSS

**Context.** Документация старого проекта (`docs/technical/01-ARCHITECTURE.md`,
`03-PAGES.md`) не фиксирует используемый CSS-подход (не дочитан `02-FRONTEND.md`).
MASTER PROMPT §90 требует сначала функциональность, но UI должен быть аккуратным,
современным и адаптивным.

**Decision.** `apps/web` использует Tailwind CSS (utility-first) поверх Next.js App
Router — быстрый старт, встроенная поддержка в `create-next-app`, не блокирует
дальнейший выбор компонентной библиотеки/дизайн-системы на фазе PHASE 31.

## ADR-0013 — Подпись коммитов

**Context.** `git config commit.gpgsign` не настроен, `gpg --list-secret-keys` не
возвращает ключей в текущем окружении.

**Decision.** Коммиты создаются без подписи до появления ключа (см. `RISKS.md`).
Это не отключение какой-либо проверки в CI/репозитории — просто подписи физически
нет возможности создать в этом окружении.
