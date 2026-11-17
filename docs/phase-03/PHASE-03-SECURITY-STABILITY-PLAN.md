# PHASE 03 — Security & Stability: план

**Версия:** 1.1 · **Статус:** PROPOSED — ждёт утверждения владельца. Продуктовый код не менялся, ветки задач не созданы.
**Дата:** 2026-11-15 · **Chief:** twomc-chief · **Основание:** `docs/audit/phase-02/FULL-PROJECT-AUDIT-REPORT.md` (разделы 9, 11, 12, 17).
**Связанный документ:** `docs/phase-03/GITHUB-RULESETS-AND-CHIEF-GIT-WORKFLOW.md` (v3.1).
**Подготовка:** P3-01/P3-02 — Engineering Director; P3-03/P3-04/P3-06 и факты GitHub — Platform & Integrations Director (с DevOps Lead); P3-05 и сводка — Chief; независимое ревью — Quality & Security Director (вердикт READY WITH FIXES, находки REV-01..REV-15 внесены); вопросы владельцу — Owner Liaison. Ключевые утверждения выборочно перепроверены Chief по коду и GitHub API.

## 1. Цель и границы

Устранить шесть блокеров первого production-деплоя из аудита Phase 02 и закрыть связанные с ними риски стабильности.

**В scope:** SEC-01, SEC-02/04, SEC-03 + DEP-01..06 (включая лимиты памяти и ротацию логов в production-compose), DOCK-01, CICD-03, CICD-01 — в существующем коде, инфраструктурных файлах и настройках репозитория. **Рекомендуется включить в обязательные** P3-A2 (SEC-06, cookie в production): размер S, тот же файл, аудит относил его к P0.

**Сознательно вне PHASE 03** (без отдельного решения владельца): DOCK-02 (dev-зависимости в образе API), DEP-05 (сборка образов на prod-хосте; опционально P3-03c), SEC-07 (лимиты анонимных тяжёлых операций — кроме `quick-buy` в P3-01), SEC-08 (привязка access JWT к сессии), деплой и покупка серверов, реальный платёжный провайдер (R2), волна 4 (Store), Donation Privileges, Level System, мини-игры, миграции БД, major-обновления, новые функции, изменение roadmap.

**Критерий выхода PHASE 03:** все карточки обязательного состава приняты владельцем; `pnpm audit --prod --audit-level=critical` возвращает 0 либо каждый остаток внесён в реестр исключений с датой пересмотра — без этого деплой не разрешается.

## 2. Сводка задач

| ID | Блокер | Severity | Ветка | Размер | Зависит от | Ключевые решения владельца |
|---|---|---|---|---|---|---|
| P3-05 | CICD-03 защита `main`, идентичность агента | High | `chore/p3-05-github-governance` + настройки GitHub | S (код) + шаги владельца | merge #139 и PR Phase 02 | идентичность, изоляция |
| P3-04 | DOCK-01 ключ Turnstile в образе web | High | `fix/p3-04-web-turnstile-build-arg` | S | — | временный деплой без капчи |
| P3-06a | CICD-01: уязвимости без major | High (закрывает 2 critical и 14 high) | `fix/p3-06a-deps-security-nonmajor` | M | — | — |
| P3-01 | SEC-01 вебхук + ARCH-01/02 | High (Medium для текущего production) | `fix/p3-01-payment-webhook-hmac` | M–L | — | ответ на неверную подпись; идемпотентность без миграции |
| P3-02 | SEC-02/SEC-04 реальный IP | High | `fix/p3-02-trust-proxy-client-ip` | M | P3-01, P3-04 | топология, Cloudflare |
| P3-A2 | SEC-06 cookie в production | Medium | `fix/p3-a2-prod-cookie-config` | S | P3-02 | включить в обязательные |
| P3-03a | DEP-01..04, DEP-06, лимиты compose | High | `fix/p3-03a-deploy-script-safety` | M | P3-02 (compose) | — |
| P3-03b | SEC-03 бэкапы и восстановление | High | `chore/p3-03b-backup-restore` | L | P3-03a | RPO/RTO, RU-S3, шифрование |
| P3-06b | CICD-01: major-обновления | High/Critical | `chore/p3-06-*` по пакету | M–L каждая | P3-06a | каждое major отдельно |
| P3-06c | Снятие `continue-on-error` у audit | High | PR владельца (меняет workflow) | S | P3-06a, P3-06b или исключения | реестр исключений |

Базовая ветка всех задач — `main` после слияния PR #139 и PR Phase 02 (`chore/phase-02-agent-config-audit`).

## 3. Порядок выполнения

**Ограничение исполнения.** Лимит одновременных подагентов — 3. Одна цепочка «директор -> лид -> специалист» занимает все три слота, поэтому задачи выполняются **последовательно**; параллельность — только логическая. Повышение лимита — отдельное решение владельца.

1. **P3-05** — CODEOWNERS, шаблон PR, hook и правила (PR владельца); rulesets, бот, очистка `settings.local.json` — шаги владельца. **До её принятия агенту не выдаются задачи с push, PR и слиянием** — ветки отправляет владелец.
2. **P3-04** — пилот самостоятельного push/PR.
3. **P3-06a** — overrides и lockfile, без изменения workflows.
4. **P3-01**.
5. **P3-02** — после P3-01 (`env.validation.ts`, `configure-app.ts`) и P3-04 (`docker-compose.prod.yml`).
6. **P3-A2** — если утверждена (тот же `env.validation.ts`).
7. **P3-03a** — после P3-02 (`docker-compose.prod.yml`), затем **P3-03b**.
8. **P3-06b** — по мере решений владельца; затем **P3-06c** — PR владельца со снятием `continue-on-error` и включением `Dependency security audit` в обязательные проверки.

Изменения `.github/workflows/**` (P3-06c, опционально P3-03c) владелец отправляет отдельными PR от своего имени: у бота нет права `workflow`, а push владельца в ветку бота заблокировал бы одобрение (`require_last_push_approval`).

### Матрица пересечения файлов

| Файл | P3-01 | P3-02 | P3-A2 | P3-03a | P3-03b | P3-04 | P3-05 | P3-06a | P3-06c |
|---|---|---|---|---|---|---|---|---|---|
| `apps/api/src/config/env.validation.ts` | да | да | да | | | | | | |
| `apps/api/src/configure-app.ts`, `main.ts` | да | да | | | | | | | |
| `apps/api/test/*.e2e-spec.ts` | да | да | | | | | | | |
| `infrastructure/docker-compose.prod.yml` | | да | | да | | да | | | |
| `infrastructure/nginx.twomc.su.conf.example` | | да | | | | | | | |
| `infrastructure/deploy.sh`, `.gitignore` | | | | да | | | | | |
| `infrastructure/backup/*`, `docker-compose.restore-drill.yml` | | | | | да | | | | |
| `infrastructure/web.Dockerfile` | | | | | | да | | | |
| `.github/CODEOWNERS`, шаблон PR, `.claude/**` | | | | | | | да | | |
| `.github/workflows/ci.yml` | | | | | | | | | да |
| `package.json`, `pnpm-lock.yaml` | | | | | | | | да | |
| `docs/implementation/DECISIONS.md`, `RISKS.md`, `CHANGELOG.md` | да | да | да | да | да | да | да | да | да |

Документы проекта меняются почти в каждой задаче: при последовательном выполнении конфликтов нет; при необходимости — обновление ветки через `gh pr update-branch`.

## 4. Общие правила для всех задач

**Исполнение.** Chief -> директор направления -> лид -> специалист (запись только в файлах карточки). Независимая проверка: `twomc-reviewer` по diff, затем security-проход Quality & Security. Тексты ADR — `twomc-specialist-documentation`.

**Общий Definition of Done** (дополняет карточку):

- локально PASS: lint (без `--fix`), format check, typecheck, `prisma validate`, api unit, web vitest, build api и web — команды и результаты в теле PR; никакая проверка не отмечается пройденной без фактического запуска;
- CI PR зелёный (включая e2e на service-postgres);
- новые и изменённые тесты из карточки существуют и проходят;
- ADR, `CHANGELOG.md`, `RISKS.md` обновлены, если указано;
- нет миграций, major-обновлений и изменений вне файлов карточки без решения владельца;
- независимые review и security без открытых находок уровня high;
- в шаблоне PR отмечено, затронуты ли `package.json` scripts, конфиги тестов и линтеров, `.github/**`;
- отчёт о готовности: результат, файлы, проверки, риски, блокеры, решения владельца.

**Среда проверки.**

- E2E локально — только на одноразовой БД и Redis (отдельный compose-проект, свои порты и тома), никогда на dev-БД владельца; требует разрешения владельца и запущенного Docker Desktop (сейчас демон не запущен). Без этого e2e выполняет CI.
- `docker compose config` и сборки образов — только с dummy `.env` в scratchpad: из корня compose прочитает `.env` владельца.
- `.env*` (включая `.env.example`) закрыты правилами чтения; правку `.env.example` делает владелец или даёт отдельное разрешение.

## 5. Карточки задач

### P3-01 — Подлинность платёжного вебхука и идемпотентность

- **Severity:** High; Medium для текущего production. Тестовый провайдер не регистрируется при `NODE_ENV=production` (`payment-provider.registry.ts:16`), без провайдера заказ не создаётся (503, `orders.service.ts:94-99`). Но `handleWebhook` к реестру не обращается: дефолтный секрет принимается и в production для любого **уже существующего** заказа `PENDING` — при свежей БД таких нет. Эксплуатируемо на любом стенде с `NODE_ENV` не `production` (дефолтный секрет из публичного репозитория + анонимный `quick-buy`) и с подключением реального провайдера.
- **Проблема:** `env.validation.ts:126-131` (дефолт `test-webhook-secret`, `allow('')`; комментарий на `:128` ложно утверждает HMAC); `orders.service.ts:300-308` (пустой секрет равен пустому); секрет в теле (`payment-webhook.dto.ts:9`); `orders.service.ts:319-358` — проверка `PENDING` вне транзакции, двойной `usedCount`, 500 при повторе, перезапись `paymentId`, нет сверки суммы; `payments-webhook.controller.ts:19-24` игнорирует `:provider`; `quick-buy` без throttle (`orders.controller.ts:20-23`); raw body не включён; CI не задаёт `PAYMENT_WEBHOOK_SECRET` — e2e опирается на дефолт.
- **Дизайн:**
  - `PaymentProvider.verifyWebhook(rawBody, headers)` — событие `{orderNumber, paymentId, status, amount, currency}` или `null`; тестовый провайдер — HMAC-SHA256 над `timestamp.rawBody`, заголовки `x-twomc-signature`, `x-twomc-timestamp`, окно ±5 минут, `timingSafeEqual` (образец — `plugin-signature.guard.ts`); пустой секрет — всегда отказ.
  - `rawBody: true` через общую константу опций для `main.ts` и всех e2e-helper-ов.
  - Провайдер выбирается по `:provider` (неизвестный — 404); секрет из тела убирается.
  - Атомарный переход: `updateMany where {orderNumber, status: PENDING}` в транзакции; сверка суммы (`Decimal.equals`) и валюты (задаётся провайдером: в `Order` нет поля currency); запрет перезаписи `paymentId`. `usedCount +1` ровно один раз при успешном переходе статуса (count = 1); `promoCodeUsage.createMany({skipDuplicates})` — только для пользователей (у гостей записи нет).
  - Тестовый провайдер — только при `NODE_ENV` in {development, test}.
  - `@Throttle` на `quick-buy` (до P3-02 работает по общему IP прокси — низкий риск, production нет).
  - Дефолт секрета удаляется; e2e-helper сам задаёт `PAYMENT_WEBHOOK_SECRET` до создания приложения — правка `ci.yml` не нужна. Обязательность секрета в production — вместе с реальным провайдером (R2). Исправить комментарий `env.validation.ts:128`.
- **Файлы:** `apps/api/src/main.ts`, `configure-app.ts`, `config/env.validation.ts`, `modules/store/payment/payment-provider.interface.ts`, `payment/test-payment-provider.service.ts`, `payment/payment-provider.registry.ts`, `payments-webhook.controller.ts`, `dto/payment-webhook.dto.ts`, `orders.service.ts`, `orders.controller.ts`; новый `apps/api/test/helpers/sign-payment-webhook.ts`. Вне scope: реальный провайдер, доставка, миграции.
- **Тесты:**
  - unit `test-payment-provider.service.spec.ts`: валидная подпись; чужой секрет; изменён 1 байт; подпись над тем же JSON с другим форматированием пробелов (доказательство raw body); просроченный timestamp; пустой секрет; нет заголовка.
  - unit `orders.service.spec.ts`: повтор — `already_processed`; `amount_mismatch`; `payment_id_mismatch`; несовпадение `order.paymentProvider` и `:provider`; `failed` после `COMPLETED` не меняет статус; `usedCount` ровно +1 (пользователь и гость).
  - unit `payment-provider.registry.spec.ts`: test/development — есть; production/staging — нет.
  - e2e `store-checkout.e2e-spec.ts`: подписанные запросы вместо секрета в теле; без подписи; чужая подпись; неизвестный провайдер (404); переплата/недоплата; повтор того же подписанного запроса внутри окна; `Promise.all` из 2 и 10 вебхуков на заказ с промокодом (один переход, `usedCount === 1`, нет 500); при `NODE_ENV=production` вебхук отвечает 404, `quick-buy` — 503.
- **ADR:** «Платёжный вебхук: HMAC и сверка суммы»; ADR-0034 — Superseded; уточнение ADR-0009.
- **Миграции / major / lockfile / workflows:** нет.
- **Риски и откат:** `rawBody` увеличивает память на JSON-запросах; e2e без общих опций не получат raw body. Откат — revert.
- **DoD:** дефолта секрета нет; пустой секрет не принимается; HMAC над сырым телом; атомарный переход; сверка суммы и валюты; `quick-buy` с throttle; тестовый провайдер только development/test; все тесты выше существуют и проходят; ADR оформлен.

### P3-02 — Реальный IP клиента за прокси

- **Severity:** High. За прокси все пользователи получают один `req.ip`: 10 неудачных входов любого человека блокируют вход всем на 15 минут (`brute-force.service.ts:5-6,31-43`), глобальный throttle 100 запросов в минуту становится общим (`app.module.ts:54`; ThrottlerGuard v5 считает по `req.ip`), неверные IP пишутся в `lastLoginIp`, сессии, audit и `LegalConsent.ip`, Turnstile получает неверный `remoteip`.
- **Проблема:** `trust proxy` не выставляется (`configure-app.ts`, `main.ts`); `TRUST_PROXY: "true"` в `docker-compose.prod.yml:60` никем не читается и в будущем означал бы доверие всем hop-ам; nginx-пример дописывает клиентский `X-Forwarded-For` и не настраивает `real_ip` для Cloudflare; у `/socket.io/` нет `X-Real-IP`.
- **Основные места использования IP:** `auth.controller.ts:51`, `social-auth.controller.ts:68`, `auth.service.ts:245-390` (brute-force, captcha, `lastLoginIp`, IP сессии), `registration.service.ts:178,224,535`, `audit.interceptor.ts:132,145`, `forms.controller.ts:76`, `captcha.service.ts:28,45-46`, `admin-tools.service.ts:636-650`, `export.service.ts:218,231`. WebSocket-шлюзы IP не используют, WS-лимиты считаются по `userId` (`ws-rate-limit.ts:21-25`).
- **Дизайн (API, Engineering):** чистая функция `resolveTrustProxy(raw)` в `apps/api/src/config/trust-proxy.ts`: пусто — выключено; целое число hop-ов; `loopback`, `linklocal`, `uniquelocal`; список CIDR. `true` и `*` отвергаются при старте. `configureApp` вызывает `app.set('trust proxy', ...)`. **Обязательная** нормализация IPv4-mapped адресов (`::ffff:1.2.3.4` -> `1.2.3.4`) для ключей brute-force, throttle и сохраняемых IP — иначе один клиент получит два счётчика. Проверить, как SSR web обращается к API: если по внутреннему адресу, SSR-запросы разделяют IP контейнера web — зафиксировать, нужен ли проброс заголовка.
- **Дизайн (инфраструктура, Platform):** nginx передаёт ровно один достоверный адрес (`X-Forwarded-For $remote_addr`), `X-Real-IP` в `/socket.io/`; при Cloudflare — `set_real_ip_from` с официальными диапазонами, `real_ip_header CF-Connecting-IP`, `real_ip_recursive on`, процедура обновления диапазонов; compose — `TRUST_PROXY: ${TRUST_PROXY:-1}`. Для топологий «nginx -> api» и «Cloudflare -> nginx -> api» с `real_ip` значение в API — `1`. Рекомендуется ограничить доступ к origin диапазонами Cloudflare на файрволе хоста.
- **Исполнение:** одна ветка, последовательно: API (Engineering), затем nginx и compose (Platform) — без промежуточного состояния, где новая валидация отвергает старое `"true"`.
- **Файлы:** `apps/api/src/configure-app.ts`, `config/env.validation.ts`, новые `config/trust-proxy.ts` и `trust-proxy.spec.ts`, `auth.controller.ts:51`, `social-auth.controller.ts:68` (нормализация); `infrastructure/nginx.twomc.su.conf.example`, `docker-compose.prod.yml:60`. Вне scope: Redis-хранилище throttler (нужно только при нескольких инстансах), изменение лимитов.
- **Тесты:** unit `trust-proxy.spec.ts` (пусто, число, `loopback`, CIDR; отказ для `true`, `*`, `-1`, мусора) и нормализации IPv4-mapped; e2e `trust-proxy.e2e-spec.ts` с `TRUST_PROXY=loopback`: 10 неудачных входов с `X-Forwarded-For` A блокируют A, B входит; без `TRUST_PROXY` заголовок игнорируется; цепочка `a, b` не обходит лимит; `lastLoginIp` равен адресу из заголовка; `::ffff:` и обычная форма одного адреса — один счётчик. Регрессия `auth.e2e-spec.ts`.
- **ADR:** «Политика TRUST_PROXY»; обновить `docs/technical/09-AUTHENTICATION.md`.
- **Зависимости:** после P3-01 и P3-04. Решение владельца: топология и Cloudflare.
- **Миграции / major / lockfile / workflows:** нет.
- **Риски и откат:** слишком малое значение — безопасный провал (как сейчас); слишком большое — подделка IP, отсюда строгая валидация и тест на подделку. Откат — убрать переменную.
- **DoD:** `trust proxy` читается из `TRUST_PROXY`; `true`/`*` отвергаются; нормализация IP; e2e доказывает независимые счётчики и отсутствие подделки; nginx и compose согласованы; ADR оформлен.

### P3-A2 — Cookie в production (рекомендуется включить в обязательные)

- **Проблема:** `env.validation.ts:31-33` — `COOKIE_SECURE=false`, `COOKIE_DOMAIN=localhost`, `COOKIE_SAMESITE=lax` по умолчанию и в production не принуждаются: refresh-cookie может уйти без `Secure`.
- **Дизайн:** `Joi.when('NODE_ENV', { is: 'production', ... })` — `COOKIE_SECURE=true` и явный `COOKIE_DOMAIN` обязательны.
- **Тесты:** unit валидации схемы (production без `COOKIE_SECURE=true` или с `localhost` отвергается; development допускает).
- **DoD:** production не стартует с небезопасными cookie; значения согласованы с Platform до merge. **Размер:** S.

### P3-03a — Безопасность `deploy.sh` и лимиты production-compose

- **Severity:** High (DEP-01), Medium (остальное). Нумерация DEP — по отчёту Platform Phase 02; сводная строка отчёта аудита перечисляла эти пункты с другими номерами и включала лимиты compose — здесь они включены явно.
- **Проблема (подтверждено):**
  - DEP-01: `deploy.sh:49-65` — `prisma migrate deploy` до health check, откат возвращает только образы.
  - DEP-02: `deploy.sh:28` — в цепочке `health && health` при `set -e` **провал первой проверки** не останавливает скрипт (воспроизведено), и печатается ложное «Откат выполнен»; провал второй проверки завершает скрипт корректно.
  - DEP-03: `.release` и `.release.prev` не игнорируются (`git check-ignore` пуст) — после первого деплоя следующий остановится на «Рабочая директория не чистая».
  - DEP-04: при первом деплое нет `.release.prev` — автооткат невозможен, плохой релиз остаётся работать.
  - DEP-06: `docker image prune -f` не удаляет старые тегированные образы.
  - Compose: нет `mem_limit`/`deploy.resources` и ротации логов json-file (`docker-compose.prod.yml` — проверено, отсутствуют).
- **Дизайн:** снимок БД перед `migrate deploy` (скрипт P3-03b; до его готовности — `pg_dump` с `umask 077` в каталог вне репозитория и вне образов) и остановка деплоя при его неудаче; явные проверки health с `||` и ненулевым выходом при провале отката; `.release*` в `.gitignore`; честная остановка при отсутствии предыдущего релиза; хранение N последних тегов; в compose — лимиты памяти и `logging.options.max-size`/`max-file`; в runbook — правило expand/contract для необратимых миграций.
- **Файлы:** `infrastructure/deploy.sh`, `.gitignore`, `infrastructure/docker-compose.prod.yml` (после P3-02); новый `docs/runbooks/deploy.md`.
- **Проверки:** `bash -n`; shellcheck без установки в систему (временное окружение `shellcheck-py` в scratchpad или контейнер `koalaman/shellcheck` — нужен Docker); тест DEP-02 через заглушки `health` (отдельно: падает первая; падает вторая); `git check-ignore .release .release.prev`; `docker compose config -q` на копии с dummy `.env`.
- **Сценарии:** падение health — ненулевой выход и честное сообщение; первый деплой без `.release.prev`; повторный деплой не блокируется `.release`; неудача снимка БД — деплой не продолжается.
- **Миграции / major / lockfile / workflows:** нет.
- **DoD:** DEP-01..04, DEP-06 и лимиты compose закрыты и проверены сценариями; runbook описывает откат схемы из дампа. **Размер:** M.

### P3-03b — Бэкапы и восстановление

- **Severity:** High (SEC-03). Бэкапов нет; тома `postgres-data`, `redis-data`, `uploads` без копий.
- **Дизайн:**
  - Postgres: `pg_dump -Fc` через `docker compose exec -T postgres`, `pg_dumpall --globals-only`, манифест с sha256 и `pg_restore --list`.
  - Шифрование: `age` по публичному ключу (приватный — офлайн у владельца) или gpg — выбор владельца.
  - Хранение: RU-S3 (rclone или `aws s3 --endpoint-url`) и локальный fallback с ротацией и `umask 077`. Ключи доступа не создаются и не коммитятся.
  - `uploads`: архив тома через временный контейнер (read-only монтирование); при переходе на S3-драйвер — бэкап бакета.
  - Redis не бэкапится (кеш и счётчики; refresh-сессии хранятся в Postgres) — подтверждает владелец.
  - Restore-drill: `docker-compose.restore-drill.yml`, проект `twomc-restore-drill`, порт `127.0.0.1:55432`, свои тома, без prod `env_file`; синтетические данные через `psql` (seed и e2e не используются). Восстановление настоящего дампа (ПДн) и применение миграций к одноразовой БД — только по отдельному разрешению и после появления сервера (R8).
- **Файлы (новые):** `infrastructure/backup/backup.sh`, `restore.sh`, `restore-drill.sh`, `infrastructure/docker-compose.restore-drill.yml`, `docs/runbooks/backup-restore.md`; обновить `RISKS.md` (новый риск; связь с R3, R8), `docs/technical/33-DEPLOYMENT.md`, `docs/implementation/phases/PHASE-35-production-infrastructure.md`.
- **Проверки:** `bash -n`, shellcheck; drill на синтетике (нужен Docker); число строк и sha256 до и после; расшифровка ключом.
- **Сценарии:** успешный цикл дамп -> шифрование -> восстановление; повреждённый дамп (sha256 не совпадает) — отказ; нет S3 — локальный fallback; нехватка места — ненулевой выход до начала деплоя.
- **Зависимости:** P3-03a; решения владельца — RPO/RTO (предложение: RPO 24 ч плюс снимок перед каждым деплоем с миграциями, RTO 4 ч), провайдер RU-S3, age или gpg, срок хранения; R3, R8.
- **Миграции / major / lockfile / workflows:** нет.
- **DoD:** скрипты проходят `bash -n` и shellcheck; drill на синтетике выполнен, и в runbook записаны дата, размер дампа, число строк до и после, время восстановления против RTO; RPO/RTO утверждены; review и security пройдены. Включение по расписанию на сервере — после появления сервера. **Размер:** L.
- **Опционально P3-03c (только по решению владельца):** сборка образов в CI и registry (DEP-05) — расходы, токены, изменение workflows (PR владельца).

### P3-04 — Ключ Turnstile в образе web

- **Severity:** High. `infrastructure/web.Dockerfile:25,29` и `docker-compose.prod.yml:81` передают `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, а код читает `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`apps/web/src/lib/env.ts:29`). Без ключа форма уходит без токена капчи, API такой запрос отклоняет — вход и регистрация в production не работают.
- **Дизайн:** заменить имя на `NEXT_PUBLIC_TURNSTILE_SITE_KEY` в ARG/ENV Dockerfile и `args` compose; fail-fast — `${NEXT_PUBLIC_TURNSTILE_SITE_KEY:?...}` в compose и `RUN test -n "$NEXT_PUBLIC_TURNSTILE_SITE_KEY"` перед `next build`. Других упоминаний `HCAPTCHA` в коде нет (только в документах).
- **Файлы:** `infrastructure/web.Dockerfile`, `infrastructure/docker-compose.prod.yml`; документы R17 и `docs/technical/33-DEPLOYMENT.md`. Вне scope: `apps/web/src`, `.env*`.
- **Проверки:** без Docker — `next build` с `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (публичный тестовый ключ Cloudflare) и поиск ключа в `apps/web/.next/static`; с Docker — `docker build` с build-arg и поиск в образе; сборка с пустым ключом падает.
- **Зависимости:** нет; ключ (R17) — владелец; решение: допустим ли временный деплой без капчи.
- **Миграции / major / lockfile / workflows:** нет.
- **DoD:** ключ найден в бандле; пустой ключ останавливает сборку; `HCAPTCHA` вне документов не встречается; review пройден. **Размер:** S — пилот самостоятельного push/PR.

### P3-05 — Защита `main` и идентичность агента

- **Severity:** High (CICD-03). `main` не защищена, rulesets отсутствуют, агент работает под токеном владельца с правами admin; `settings.local.json` разрешает `gh api *` и `gh pr *`.
- **Содержание:** `docs/phase-03/GITHUB-RULESETS-AND-CHIEF-GIT-WORKFLOW.md` (v3.1).
- **Код (ветка `chore/p3-05-github-governance`, отправляет владелец):** `.github/CODEOWNERS` (`* @younaxo`), `.github/pull_request_template.md`, `.claude/hooks/git-guard.mjs` и `git-guard.test.mjs`, новая версия `.claude/settings.json` (раздел 5.3 схемы).
- **Шаги владельца:** очистка `settings.local.json`; rulesets `main-protection`, `all-branches-integrity`, `tags-protection`; Dependabot alerts и security updates; машинный аккаунт (2FA, collaborator write, PAT без `workflow`); remote `agent` и конфигурация `gh` бота.
- **Проверки:** `node --test .claude/hooks/git-guard.test.mjs` (не менее 50 команд, включая обходы, пустой stdin и мусорный JSON); `gh api .../rules/branches/main`; `codeowners/errors` пуст; пробы раздела 8.1 схемы; **обязательные серверные пробы 8.2** под токеном бота (push в `main`, force-push, удаление ветки, тег, изменение workflow, merge через API без одобрения, изменение rulesets — всё отклонено GitHub); `PushEvent` первого push агента от бота.
- **DoD «P3-05 принят»:** инварианты I1–I7 подтверждены пробами 8.1 и 8.2. **DoD «пилот»** (отдельно): P3-04 прошла через бота и слита владельцем. **Размер:** S (код) + шаги владельца.

### P3-06 — Уязвимые зависимости

- **Severity:** High. `pnpm audit` (2026-11-15; повторено независимым ревью, lockfile не менялся): 46 уникальных high/critical advisory (111 путей), из них 39 — в production-зависимостях; 8 critical, 39 high. Job `Dependency security audit` всегда зелёный (`ci.yml:136`, `continue-on-error`). Dependabot security updates выключены.

| Пакет | Advisory | Исправлено в | Цепочка | Стратегия |
|---|---|---|---|---|
| joi | 1 high | 17.13.9 | direct, prod | обновление в пределах `^17.13.0` |
| handlebars | 2 critical | 4.7.10 | dev, через ts-jest | override в пределах major |
| multer | 7 high | 2.5.0 | prod, через `@nestjs/platform-express@10` (пин 2.0.2) | override в пределах major |
| body-parser | 1 high | 1.20.9 | prod, через platform-express и express | override в пределах major |
| lodash | 1 high | 4.18.0 | prod, через `@nestjs/config` | override в пределах major |
| postcss | 2 high | 8.5.18 | prod, через next (пин 8.4.31) | override `next>postcss` |
| picomatch, glob | по 1 high | 4.0.4, 10.5.0 | dev, через `@nestjs/cli`, `eslint-config-next` | override в пределах major |
| next | 3 critical, 9 high | 15.5.28 | direct, prod | **только major** 14 -> 15.5 (с React 19) |
| tar | 1 critical, 8 high | 7.5.21 | prod, через `bcrypt@5 > node-pre-gyp` (tar 6) | major (bcrypt 6) или override через major |
| nodemailer | 5 high | 10.0.6 | direct, prod (6.10.1) | **только major** (PR #17 — 10.0.15, CI зелёный) |
| tinypool | 2 critical | 2.1.2 | dev, через vitest 3 | major (vitest 4) или принятие риска |
| deepmerge-ts | 1 high | 8.0.0 | prod, через `prisma@6.19.3` | override через major или Prisma 7 |
| tmp | 1 high | 0.2.6 | dev, через `@nestjs/cli` | принятие риска или override 0.x |

- **Итог:** без major закрываются 16 advisory (79 путей): 2 critical и 14 high. Остаются 30 advisory, включая 6 critical (next 3, tar 1, tinypool 2) — до решений владельца. Для production критичны next и tar.
- **P3-06a (`fix/p3-06a-deps-security-nonmajor`; workflows — нет):** `pnpm.overrides` в корневом `package.json` (multer `^2.5.0`, body-parser `^1.20.9`, lodash `^4.18.0`, `next>postcss` `^8.5.18`, picomatch `^4.0.4`, glob `^10.5.0`, handlebars `^4.7.10`); joi до 17.13.9. Overrides выходят за версии, протестированные Nest 10, — обязательны smoke загрузки файлов (multer) и отправки почты на тестовом SMTP.
- **P3-06b (каждая — отдельная ветка и решение владельца):** `chore/p3-06-next15-react19`, `chore/p3-06-nodemailer10`, `chore/p3-06-bcrypt6-tar`, `chore/p3-06-vitest4`, `chore/p3-06-prisma-deepmerge`; опционально `chore/p3-06-nest11` (express 5). Next 15: App Router требует React 19; middleware и server actions в коде нет, `next/image` с `remotePatterns` используется (14 файлов) — advisory оптимизатора изображений считать применимыми.
- **P3-06c (PR владельца):** снять `continue-on-error`, когда `pnpm audit --audit-level=high` возвращает 0 либо остаток покрыт `pnpm.auditConfig.ignoreGhsas` с реестром исключений в `docs/` (GHSA, обоснование, кто принял решение, дата пересмотра — не более 90 дней); затем добавить `Dependency security audit` в обязательные проверки ruleset.
- **Файлы:** корневой `package.json`, `pnpm-lock.yaml` (06a, 06b); `.github/workflows/ci.yml` (06c); ADR о замене сроков ADR-0014; новый риск в `RISKS.md`; реестр исключений.
- **Проверки:** `pnpm audit --audit-level=high` и `--prod` (дата и снимок отчёта прикладываются к PR — результат меняется со временем); `pnpm install --frozen-lockfile` на чистом клоне; полный набор локальных проверок; CI с e2e; smoke загрузки и SMTP.
- **Сценарии:** после P3-06c добавленная уязвимая версия валит CI; overrides не ломают vitest и ts-jest.
- **Зависимости:** решения владельца по major и остаточному риску; судьба PR Dependabot #7, #9, #14, #17 (зелёные) и #10–#13, #15, #16, #138 (красные).
- **Lockfile / major / миграции / workflows:** 06a — да / нет / нет / нет; 06b — да / да / Prisma 7 может потребовать / нет; 06c — нет / нет / нет / да.
- **DoD (P3-06a):** 16 advisory закрыты на дату PR; остаток совпадает с согласованным списком; CI зелёный; smoke пройдены; review и QA пройдены. **Размер:** 06a — M; каждая 06b — M–L; 06c — S.

## 6. Смежные задачи (только по отдельному решению)

| ID | Находка | Суть | Файлы | Размер |
|---|---|---|---|---|
| P3-A1 | SEC-05 | admin-2FA молча выключается без `TWO_FACTOR_ENCRYPTION_KEY`; WS `mute_user`/`ban_user` и `recipients` без 2FA | `permissions.guard.ts:41-42`, `chat.gateway.ts:323-390`, `communications.controller.ts:39-53`, `env.validation.ts` | M |
| P3-A3 | SEC-10 | refresh не атомарен — две живые сессии | `auth.service.ts:405-453` | S–M |
| P3-01b | — | вебхук голосования: bcrypt-проверка до throttle по реальному IP (CPU-DoS), перебор slug через 404. Дефекта SEC-01 нет: секрет на сайт, `@Length(1, 500)` | `voting.service.ts:48-63`, `vote-webhook.dto.ts` | S |

Порядок, если утверждены: после P3-02 и P3-A2 (общий `env.validation.ts`).

## 7. Решения владельца

**Нужно сейчас, чтобы начать** (сведено Owner Liaison):

| # | Вопрос | Варианты | Рекомендация | Разблокирует |
|---|---|---|---|---|
| D1 | Утвердить PHASE 03 | а) как в разделе 3; б) с другим порядком или составом; в) не сейчас | а | старт любой задачи |
| D2 | Слить PR #139 и PR Phase 02 до старта | а) да; б) нет — тогда базой задач будет не `main` | а | базовую ветку задач |
| D3 | Идентичность агента и изоляция | а) машинный аккаунт + L2; б) GitHub App; в) токен владельца с подтверждением каждого push | а | P3-05, самостоятельные push/PR |
| D4 | Rulesets, CODEOWNERS, Dependabot alerts; `disableBypassPermissionsMode`; очистка `settings.local.json` | а) всё по схеме; б) то же, но удаление `disableBypassPermissionsMode` намеренное | а | P3-05 |
| D5 | P3-01: ответ на неверную подпись | а) 401; б) 200 `accepted:false` | а | P3-01 |
| D6 | P3-01: идемпотентность | а) без миграции; б) уникальный индекс и журнал событий (миграция) | а | P3-01 |

**Можно позже — до завершения конкретной задачи:**

| # | Решение | Задача | Рекомендация |
|---|---|---|---|
| D7 | Cloudflare перед nginx или нет; ограничение origin файрволом | P3-02 | решить вместе с хостингом |
| D8 | Временный деплой без капчи; ключи Turnstile (R17) | P3-04 | нет, ключ обязателен |
| D9 | RPO/RTO, провайдер RU-S3, age или gpg, срок хранения | P3-03b | RPO 24 ч + снимок перед деплоем, RTO 4 ч |
| D10 | Одноразовые БД и Redis в Docker для локальных e2e и restore-drill | P3-01, P3-02, P3-03b | да, только синтетика |
| D11 | Каждое major P3-06b; принятие остаточного риска (tmp, dev-цепочки) с датой пересмотра | P3-06b, P3-06c | сначала Next 15 + React 19 и nodemailer 10 |
| D12 | Судьба PR Dependabot #7, #9–#17, #138 | P3-06 | закрыть заменённые overrides; major — в P3-06b |
| D13 | P3-A2 в обязательные; P3-A1, P3-A3, P3-01b | раздел 6 | P3-A2 — обязательно; P3-A1 и P3-A3 — включить |
| D14 | Лимит параллельных подагентов (сейчас 3) | скорость PHASE 03 | оставить 3 |
| D15 | Изменения `.github/workflows/**` — отдельными PR владельца | P3-06c, P3-03c | да |

## 8. Риски плана

- Ужесточение валидации env (P3-01, P3-02, P3-A2, P3-A1) может не дать стартовать будущему production, если `.env` сервера не заполнен. Production пока не существует; значения сверяются при подготовке сервера.
- Overrides P3-06a выходят за версии, протестированные Nest 10; защита — полный набор тестов и smoke загрузки и почты.
- Без запущенного Docker локальные e2e, сборка образов и restore-drill невозможны; e2e выполняет CI, drill — нет.
- Rulesets без машинного аккаунта не ограничивают агента (токен владельца — admin); до принятия P3-05 агенту не выдаются задачи с push и PR.
- Зелёный CI не доказывает безопасность изменений в `package.json` scripts и конфигурациях тестов — нужен обязательный пункт шаблона PR и ревью владельца.
- Результат `pnpm audit` меняется со временем: критерии фиксируются на дату PR.

## 9. Источники

- `docs/audit/phase-02/FULL-PROJECT-AUDIT-REPORT.md`, `docs/audit/phase-02/AUDIT-CHECKPOINT.md`
- `docs/phase-03/GITHUB-RULESETS-AND-CHIEF-GIT-WORKFLOW.md` (v3.1)
- Код и конфигурация: пути и строки в карточках (состояние `main` `7bc8868`).
- GitHub API (только GET, 2026-11-15): check-runs коммита `477f52b`, настройки репозитория, collaborators, rulesets.
- `pnpm audit --json` (2026-11-15), выполнен дважды независимо; lockfile не изменялся.
