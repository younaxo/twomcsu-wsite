# PHASE 01 — Project bootstrap

## Сделано

- pnpm workspace: `apps/api` (NestJS 10 CLI scaffold), `apps/web` (Next.js 14 App
  Router + Tailwind CSS, `create-next-app`), `packages/shared` (`@twomc/shared`,
  пока пустой барел — наполняется по мере появления общих контрактов).
- Корневой `package.json`: единые скрипты `lint`/`format`/`format:check`/`typecheck`/
  `test`/`build`/`dev` (`pnpm -r --if-present`), метаданные автора/репозитория.
- `apps/api`: tsconfig переведён в strict-режим (`strict`, `noUnusedLocals`,
  `noUnusedParameters`, `forceConsistentCasingInFileNames`), ESLint
  `@typescript-eslint/no-explicit-any` включён как `error` (было `off` в шаблоне
  NestJS CLI — не соответствовало MASTER PROMPT §110).
- `apps/web`: добавлены `format`/`format:check`/`typecheck` скрипты и `prettier`
  (отсутствовали в шаблоне `create-next-app`), `transpilePackages: ['@twomc/shared']`
  и `images.remotePatterns` для будущего CDN-домена в `next.config.mjs`.
- `.editorconfig`, `.gitattributes` (LF по умолчанию), корневой `.gitignore`,
  `.prettierrc.json`/`.prettierignore` (исключает `docs/technical` — исторические
  документы не переформатируются).
- `.env.example` — полный список переменных: текущие (32-ENVIRONMENT.md) и
  предложенные новые (CDN/STORAGE_*, BOOTSTRAP_*_PASSWORD, PAYMENT_*, TRUST_PROXY).
- Корневой `README.md` (стек, локальный запуск, команды, архитектура кратко).

## Проверено (Quality Baseline, MASTER PROMPT §33)

Выполнено из корня монорепо, все команды зелёные:

| Команда | Результат |
|---|---|
| `pnpm install` | OK |
| `pnpm lint` | OK (0 ошибок/предупреждений) |
| `pnpm format:check` | OK |
| `pnpm typecheck` | OK (`@twomc/shared`, `@twomc/api`, `@twomc/web`) |
| `pnpm test` | OK (1 passed — стандартный `AppController` спек NestJS) |
| `pnpm build` | OK (`nest build`, `next build` — production-сборка) |

`pnpm db:*` скрипты определены, но ещё не работают — Prisma появится в PHASE 04.

## Не входит в эту фазу

- Helmet/CORS/ValidationPipe/health-check — PHASE 02–05 (это уже функциональность,
  не bootstrap).
- Docker Compose — PHASE 03.
- Prisma schema — PHASE 04.
