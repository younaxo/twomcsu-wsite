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

## R3 — Объектное хранилище (S3-совместимое) для CDN — OPEN

`StorageService` с `local`-драйвером реализуется полностью рабочим для dev. Для
production нужен S3-совместимый бакет и домен `cdn-files.twomc.su`.
**Нужно от владельца:** `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`,
`STORAGE_SECRET_KEY`, настройка DNS/реверс-прокси для `cdn-files.twomc.su`.

## R4 — SMTP (доставка писем) — OPEN

`EmailService` реализуется с рабочим интерфейсом; без `SMTP_HOST/USER/PASSWORD`
отправка писем выключается (логируется, не падает). Влияет на: email verification,
password reset, email-дайджесты.
**Нужно от владельца:** SMTP-credentials (или SaaS типа SendGrid/Mailgun/Postmark).

## R5 — hCaptcha — OPEN

Нужны `HCAPTCHA_SECRET` (server) и `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` (client) для
production. В dev/test работает `HCAPTCHA_DISABLED=true`.
**Нужно от владельца:** регистрация сайта в hCaptcha, получение ключей.

## R6 — Внешние интеграции стриминга (Twitch/YouTube) — OPEN

`TWITCH_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY` — нужны только на фазе PHASE 14
(Streaming). Реализуется с явной проверкой наличия ключей — модуль выключается,
если ключей нет, без падения остального приложения.

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
