# RISKS — внешние блокеры и ограничения

Формат: статус (`OPEN`/`MITIGATED`), описание, что сделано в обход блокера,
что требуется от владельца проекта, чтобы снять блокер полностью.

## R1 — Подпись коммитов (GPG) — MITIGATED (частично)

`git config commit.gpgsign` не настроен в рабочем окружении, `gpg --list-secret-keys`
не возвращает секретных ключей. Коммиты создаются без подписи. Чтобы включить
подпись: сгенерировать GPG-ключ (`gpg --full-generate-key`), привязать его к
`menidan78.offical@gmail.com`, выполнить `git config user.signingkey <KEYID>` и
`git config commit.gpgsign true` в этом репозитории, добавить публичный ключ в
GitHub (Settings → SSH and GPG keys).

## R2 — Платёжный провайдер — OPEN

Нет выбранного провайдера и нет production-credentials (см. ADR-0009). Реализован
интерфейс `PaymentProvider` + `TestPaymentProvider` для dev/test (безопасен: не
позволяет завершить заказ без внутреннего вызова, отключается в production).
**Нужно от владельца:** выбрать провайдера (ЮKassa/CloudPayments/Stripe/другой),
получить `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`.

PHASE 17 (Store): реализовано полностью по плану выше —
`modules/store/payment/{payment-provider.interface,payment-provider.registry,
test-payment-provider.service}.ts`, вебхук `POST /webhooks/payments/:provider`
(ADR-0034). `PaymentProviderRegistry` не регистрирует `TestPaymentProvider` при
`NODE_ENV=production` — до выбора реального провайдера `createFromCart()`/
`quickBuy()` в production вернут 503 (ADR-0039), не тихий фейк-успех.

## R3 — Объектное хранилище (S3-совместимое) для CDN — OPEN

`StorageService` с `local`-драйвером реализуется полностью рабочим для dev. Для
production нужен S3-совместимый бакет и домен `cdn-files.twomc.su`.
**Нужно от владельца:** `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`,
`STORAGE_SECRET_KEY`, настройка DNS/реверс-прокси для `cdn-files.twomc.su`.
Затронуто также PHASE 15 (Forms): `POST /forms/:slug/responses/upload` (загрузка
файлов для `FILE_UPLOAD`/`IMAGE_GALLERY`) не реализован в PHASE 15 — поля этих
типов принимают уже готовые URL в `fileUrls` (см. `FormsService.buildAnswerData`),
сам upload-эндпоинт появится вместе с `StorageService` (PHASE 23).
Затронуто также PHASE 16 (Reports): `POST /reports/:reportNumber/attachments`,
`.../messages/:messageId/attachments` (вложения к обращениям) и
`POST /admin/reports/:reportNumber/export` (экспорт ответов) не реализованы —
та же зависимость от `StorageService`, ADR-0033.

## R4 — SMTP (доставка писем) — OPEN

`EmailService` реализуется с рабочим интерфейсом; без `SMTP_HOST/USER/PASSWORD`
отправка писем выключается (логируется, не падает). Влияет на: email verification,
password reset, email-дайджесты.
**Нужно от владельца:** SMTP-credentials (или SaaS типа SendGrid/Mailgun/Postmark).

## R5 — hCaptcha — OPEN

Нужны `HCAPTCHA_SECRET` (server) и `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` (client) для
production. В dev/test работает `HCAPTCHA_DISABLED=true`.
PHASE 21: hCaptcha-виджет на странице входа не подключён (без site key его
нечем проверить) — ответ backend `{ requiresCaptcha: true }` показывается как
явная ошибка «требуется проверка captcha» (ADR-0052), не как «неверный пароль»;
виджет добавляется вместе с ключами.
**Нужно от владельца:** регистрация сайта в hCaptcha, получение ключей.

## R6 — Внешние интеграции стриминга (Twitch/YouTube) — OPEN

`TWITCH_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY` — нужны для реального опроса
статуса каналов (PHASE 14, Streaming — см. ADR-0026). CRUD каналов и
публичный список полностью рабочие уже сейчас; `POST /admin/streams/refresh`
честно отвечает `{refreshed: false, reason: 'no_platform_credentials_configured'}`
без ключей, без падения и без моковых данных. Сам реальный опрос API плюс
периодический cron для автообновления — когда появятся ключи (реализация
API-клиента) и PHASE 29 (cron-инфраструктура для автообновления).
**Нужно от владельца:** зарегистрировать приложение в Twitch Developer
Console и получить API key в Google Cloud Console (YouTube Data API v3).

## R7 — Web Push (VAPID) — OPEN

`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` — нужны на фазе PHASE 12 (Notifications).
Без ключей push-канал отключается, остальные каналы уведомлений работают.

## R8 — Production deployment (DNS, сервер, reverse proxy) — OPEN

В этой среде нет доступа к production-серверу/DNS. Деплой-документация и
Dockerfile/Compose готовятся (PHASE 35), но реальный выезд в прод не выполняется
в рамках этой сессии — только подготовка инфраструктуры как кода.

## R9 — GitHub Pull Request workflow — MITIGATED

`gh` CLI авторизован (`younaxo`, scopes: repo, workflow), создание PR доступно
автоматически. Если на каком-то этапе `gh` окажется недоступен — ветка и коммиты
всё равно будут запушены, PR title/description подготовлены текстом в этой же
директории, а блокер будет явно зафиксирован здесь.

## R11 — Обнаружены старые Docker volumes от предыдущего проекта (не удалены)

При первом `pnpm db:up` (PHASE 03) docker compose с project-именем `twomcsu`
(как в `docs/technical/33-DEPLOYMENT.md`) обнаружил уже существующие volumes
`twomcsu_postgres-data` и `twomcsu_redis-data`, созданные **2026-07-27** — то есть
до начала этой сессии, предположительно локальные данные предыдущей версии
проекта. Контейнеры были пересозданы поверх этих volumes (данные не удалялись —
`docker compose down` без `-v` не трогает volumes), после чего это было замечено
и **исправлено**: `infrastructure/docker-compose.yml` переименован в project
`twomc-su` (контейнеры `twomc-su-postgres`/`twomc-su-redis`), что создаёт отдельные
volumes `twomc-su_postgres-data`/`twomc-su_redis-data` и не трогает старые.

**Статус:** старые volumes `twomcsu_postgres-data`/`twomcsu_redis-data` по-прежнему
существуют на машине и не удалены — автоматическое удаление чужих/непроверенных
данных не выполнялось намеренно. **Нужно от владельца:** решить, нужны ли эти
данные (похоже на дев-дамп предыдущей версии проекта) — если нет, удалить вручную:

```bash
docker volume rm twomcsu_postgres-data twomcsu_redis-data
```

## R10 — Старая техническая документация описывает чужой (предыдущий) код

`docs/technical/*` — реверс-инжиниринг **предыдущей** кодовой базы twomc.su, а не
спецификация, написанная для этого проекта с нуля. Часть сведений помечена в
документах как «не дочитано полностью» (`49-COVERAGE-REPORT.md`, чеклист
"services scanned" частично). Там, где старая документация неполна, архитектурные
решения принимаются по лучшим практикам и фиксируются в `DECISIONS.md`, а не
додумываются как «факт старого проекта».

## R12 — Границы historical branches для PHASE 04/05 неоднозначны — MITIGATED

**Контекст.** PHASE 00–07 изначально велись в одной ветке
(`feature/project-bootstrap`) вместо отдельной ветки на каждый этап — задним
числом созданы historical branches (`feature/infrastructure`,
`feature/database-foundation`, `feature/authentication`,
`feature/rbac-permissions`, `feature/users`), указывающие на последний commit
соответствующего этапа (см. таблицу в `STATUS.md`).

Три commit'а (`344f9b1` fix(docs) — убрать шаблонный README, `9911306`
docs(status) — зафиксировать находку gitleaks, `2346864` fix(ci) — добавить
`.gitleaksignore`) оказались между завершением PHASE 04 (`33996ef`) и началом
PHASE 05 (`c8c3f65`). Это не фичи PHASE 04 и не PHASE 05 — это исправления
CI/repo hygiene (ложные срабатывания gitleaks) для PR, который на тот момент
покрывал фазы 0–4 целиком.

**Решение.** Не переписывать историю ради идеальной границы. `344f9b1`/
`9911306`/`2346864` включены в хвост `feature/database-foundation` (ветка
указывает на `2346864`) — это честнее, чем прикреплять их к PHASE 05
(`feature/authentication`), так как они фиксируют состояние CI именно после
PHASE 04, до появления кода PHASE 05. `feature/project-bootstrap` сохранена
как есть (указывает на актуальный HEAD, т.к. это действующая ветка открытого
PR #5) — согласно прямому указанию не удалять и не менять её при
нормализации.

## R13 — e2e: `beforeAll` под полным сьютом может превысить дефолтный таймаут Jest — MITIGATED

**Контекст.** `apps/api/test/*.e2e-spec.ts` поднимают полный `AppModule` через
`Test.createTestingModule(...).compile()` и создают 1–3 реальных пользователей
(`bcrypt`, 12 раундов) в `beforeAll`. По отдельности каждый файл укладывается в
дефолтный таймаут Jest (5000 мс на хук). PHASE 10 добавил восьмой параллельный
e2e-файл (`direct-messages.e2e-spec.ts`, с `app.listen(0)` для реального
Socket.IO-сервера) — под полным `pnpm test:e2e` (CI: `.github/workflows/ci.yml`,
без `--runInBand`, т.е. параллельные Jest-воркеры делят один Postgres+Redis)
`social.e2e-spec.ts` однократно упал с `Exceeded timeout of 5000 ms for a hook`
(при изолированном запуске — проходит за ~28 с). Это конкуренция за ресурсы
между воркерами, а не логическая регрессия (подтверждено повторным изолированным
запуском).

**Решение.** `jest.setTimeout(20_000)` добавлен на уровне файла в
`auth.e2e-spec.ts`, `roles.e2e-spec.ts`, `profiles.e2e-spec.ts`,
`social.e2e-spec.ts`, `users-domain.e2e-spec.ts`, `direct-messages.e2e-spec.ts`
(и явные таймауты `beforeAll(..., 30_000)`/`afterAll(..., 15_000)` в двух
последних, плюс защита `afterAll` от `undefined` при упавшем `beforeAll`).
`app.e2e-spec.ts`/`health.e2e-spec.ts` не трогались — не создают пользователей,
риск не подтверждён. Если флуктуации продолжатся на реальном CI (другое
железо/нагрузка), следующий шаг — `--runInBand` для job `test` в CI (ценой
последовательного, более медленного прогона) вместо дальнейшего роста таймаутов.
