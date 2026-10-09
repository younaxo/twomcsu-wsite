# PHASE 21 — Admin panel (frontend)

Фаза ведётся несколькими PR от актуального `main` (объём: фундамент
frontend + ~20 экранов core-админки). Статус по частям — ниже; фаза
считается завершённой только после слияния всех частей.

## Часть 1 — фундамент (`feature/admin-panel`, PR) — выполнено

### Backend
- `GET /auth/me` отдаёт `roles[]` и `permissions` (`EffectivePermissions`
  из `PermissionService`) — единственный источник effective permissions
  для frontend-меню (ADR-0052). Покрыто e2e (`roles.e2e-spec.ts`: до
  выдачи роли — пусто/`maxPriority: null`, после — ключи и роль).
- Реестр permission keys перенесён в `packages/shared/src/permissions.ts`
  (ADR-0051); seed импортирует его из `@twomc/shared` — проверено
  реальным `pnpm db:seed` (217 permission синхронизировано).
- `apps/api/tsconfig.build.json` исключает `prisma/` — `nest build`
  теперь кладёт `dist/main.js` в корень `dist/` (раньше был
  `dist/src/main.js`, и `start:prod` не работал).

### `packages/shared` — API-контракт (ADR-0051)
- `api/common.ts` (`Paginated<T>`, `ApiErrorBody`), `api/auth.ts`
  (`MeResponse`, `EffectivePermissions`, login/refresh), `api/roles.ts`,
  `api/users.ts`, `api/moderation.ts`, `api/admin.ts` (dashboard, audit
  log, broadcast, settings/site settings, saved-filters/bookmarks/
  scheduled-exports, security, content/finance, orders, export-DTO).
- Только типы и `as const`-константы — без зависимостей от NestJS/Prisma.

### `apps/web` — ядро
- `lib/env.ts`, `lib/api/errors.ts` (`ApiError` с разбором массива
  сообщений валидации, `NetworkError`, `getErrorMessage`),
  `lib/api/token-store.ts` (токен в памяти), `lib/api/client.ts`
  (fetch-клиент: `credentials: include`, Bearer, query-builder, 401 →
  single-flight refresh → один повтор, `apiFetchRaw` + `downloadFromResponse`
  для CSV).
- `lib/auth/store.ts` (Zustand: `bootstrap` single-flight, `login` с
  обработкой `requiresCaptcha`, `logout`, `reload`, `clear`; обработчик
  истёкшей сессии из HTTP-слоя), `lib/auth/permissions.ts` +
  `use-permissions.ts` (`PermissionRequirement`: ключ / любой-из /
  `anyOf`+`allOf`; superuser — wildcard).
- `lib/query/client.ts` (TanStack Query: без retry на 4xx),
  `lib/query/keys.ts` (фабрика ключей по доменам админки).
- Vitest + Testing Library (`vitest.config.ts`, `src/test/setup.ts`,
  `src/test/http.ts` — мок `fetch` без MSW). `pnpm test` из корня теперь
  запускает и web-тесты (CI без изменений).

### Проверено
- `apps/web`: 21 unit-тест (query-builder, ошибки, Bearer/credentials,
  401→refresh→retry, неудачный refresh → очистка сессии, single-flight
  refresh/bootstrap, login/captcha/logout, permission-хелперы).
- `apps/api`: e2e `roles` + `auth` — 16 тестов зелёные локально.
- `lint`/`format:check`/`typecheck`/`build` — зелёные во всех пакетах.

## Часть 2 — дизайн-система и UI-слой (`feature/frontend-design-system`) — выполнено

- Семантические токены, TwoMC UI-слой (~60 примитивов), `/design-lab` с
  витриной, Interactions / Component lab и Role prefixes, графические
  префиксы ролей, 61 unit-тест — ADR-0053/0054.

## Часть 3 — тема «Полдень» dark-first и admin-экраны (`feature/polden-production-theme`) — выполнено (PR на CI)

- Решение владельца (ADR-0055): «Полдень», тёмная тема основная, светлая
  вторичная, стекло запрещено; архивные направления удалены; шрифты
  self-hosted; overlay — solid-поверхности.
- `src/lib/admin/`: navigation (группы/пункты с `PermissionRequirement`),
  api (все эндпоинты PHASE 20), hooks (TanStack Query, инвалидация по
  доменам, перечитывание `/auth/me` при смене своих ролей/прав),
  permission-modules (подписи модулей).
- `src/components/admin/`: RequireAuth, AdminShell, PermissionGate/Can,
  PageHeader/PageSection/StatCard/DescriptionList, QueryBoundary.
- Экраны `/admin`: дашборд, users (+[id]), roles (+[id]), permissions,
  audit-log, security, settings, broadcast, content, finance, exports, tools;
  `/login`. Все permission-aware, состояния loading/error/empty/403,
  деструктивные действия через ConfirmDialog.
- Проверено: lint / format / typecheck / 61 unit-тест / production build.
- Остаётся в рамках фазы: unit-тесты страниц, QA с реальным API в браузере
  (локальный Docker), затем merge.

## Не входит в фазу
- Доменные admin-разделы (news/topics/forms/events/streams/voting/store/
  servers/gamification/chat/moderation/notifications/positions/
  departments) — PHASE 31 (All pages), после появления дизайн-системы.
- hCaptcha-виджет на странице входа — нет ключей (RISKS.md R5).
- Генерируемый из OpenAPI клиент — PHASE 30 (ручной контракт — ADR-0051).
