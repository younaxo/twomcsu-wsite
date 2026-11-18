# Отчёт: fail-fast проверка production-переменных (2026-11-17)

## 1. Итог

Production API и compose теперь не стартуют без TRUST_PROXY и TURNSTILE_SECRET_KEY, а TURNSTILE_DISABLED=true в production запрещён. Статус: PARTIAL (код и документы готовы, часть проверок не выполнена).

## 2. Что сделано

- Код (`apps/api/src/config/env.validation.ts`, fixtures тестов): в production обязательны TRUST_PROXY (число хопов) и TURNSTILE_SECRET_KEY; TURNSTILE_DISABLED=true запрещён (раньше captcha отключалась, fail-open). Ранее по ADR-0156: COOKIE_SECURE=true, COOKIE_DOMAIN, TWO_FACTOR_ENCRYPTION_KEY от 32 символов, запрет AUTH_TEST_OTP_ENABLED. Dev/test поведение не менялось.
- `infrastructure/docker-compose.prod.yml`: `TRUST_PROXY` обязателен.
- Документы: `docs/runbooks/production-env-checklist.md` (новый), ADR-0161 в `docs/implementation/DECISIONS.md`, строка в `docs/implementation/CHANGELOG.md`, этот отчёт.

## 3. Git

Ветка `fix/p3-env-prod-startup-check` от c643f4d. Коммит: см. `git log` (код и документы не закоммичены этим исполнителем). PR не создавался, push не выполнялся.

## 4. Проверки

- Выполнены (по данным Backend Lead): jest `src/config` 3 suites / 72 tests PASS, tsc, eslint, prettier чисты.
- Полный unit api: 33 suites, 321 tests, все PASS. tsc --noEmit: 0 ошибок. eslint и prettier --check по изменённым файлам: чисто.
- НЕ выполнены: `docker compose config -q` (Docker запрещён ресурсными правилами), e2e. Review и security не проводились.
- Документы: `prettier --check` не запускался (у исполнителя не было shell-инструмента), см. раздел 5.

## 5. Что осталось

- Прогнать `pnpm exec prettier --check` по 4 документам.
- Выполнить `docker compose config -q` с dummy-значениями (с TRUST_PROXY и без, с NEXT_PUBLIC_TURNSTILE_SITE_KEY и без), e2e, полный unit api.
- Review и security review; коммит, PR и CI по правилам `main`.
- HEARTBEAT.local.md не обновлён (нет shell-инструмента).

## 6. Решения владельца

- Утвердить ADR-0161.
- Сгенерировать TWO_FACTOR_ENCRYPTION_KEY самому, в чат не присылать; бэкап в менеджере паролей.
- Завести TURNSTILE_SECRET_KEY и NEXT_PUBLIC_TURNSTILE_SITE_KEY в Cloudflare.

## 7. Риски

- Деплой без этих переменных не стартует (задумано).
- Перед выкатом проверить `.env` на сервере по `docs/runbooks/production-env-checklist.md`.
- e2e с NODE_ENV=production и TURNSTILE_DISABLED=true перестанет работать; CI использует не production.
- Смена TWO_FACTOR_ENCRYPTION_KEY ломает включённую 2FA.

## 8. NEXT EXACT STEP

Backend Lead: `pnpm exec prettier --check` по 4 документам, затем `docker compose config -q` с dummy-значениями.

Ближайшие 5 шагов:

1. Prettier и compose-проверка (выше).
2. Полный unit api и e2e (не production-режим).
3. Независимые review и security.
4. Коммит, PR, зелёный CI, merge по правилам `main`.
5. Owner: утвердить ADR-0161, подготовить ключи и `.env` на сервере.
