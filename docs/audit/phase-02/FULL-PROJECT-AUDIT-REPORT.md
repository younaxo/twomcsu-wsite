# TWOMC — FULL PROJECT AUDIT REPORT

**Этап:** PHASE 02 — FULL PROJECT AUDIT / SAFE VERIFICATION (`docs/agent-prompts/02-FULL-PROJECT-AUDIT.md` v2.0)
**Дата:** 2026-11-15 · **Chief:** twomc-chief (Opus 5.5) · **Ветка:** `chore/phase-02-agent-config-audit`
**Код приложения:** идентичен `main` `7bc8868` (PR #135). Продуктовый код не изменялся.

Метки: **CONFIRMED** — подтверждено кодом, запуском или GitHub; **DOCUMENTED** — только документы/CI; **INFERRED** — вывод из кода без проверки в рантайме; **UNKNOWN/UNVERIFIED** — не проверялось. Проценты готовности не приводятся: они не измерялись.

Источники: отчёты четырёх директоров (Engineering с Backend/Frontend Lead; Quality & Security; Platform & Integrations; Product & Design с Design Lead) и выборочная проверка Chief, отмеченная **[Chief ✓]**.

---

## 1. Executive Summary

- **Сборка и тесты (CONFIRMED, локальный запуск):** lint, format, typecheck, prisma validate, api unit 132/132, web 545/545, production build api и web — PASS. API e2e локально BLOCKED (нет изолированной БД); в CI на PR #139 — зелёные (DOCUMENTED).
- **Production не готов.** Блокеры первого деплоя: подделываемый или пустой секрет платёжного вебхука (SEC-01), нет trust proxy и Cloudflare real IP (SEC-02/04), нет бэкапов и необратимые миграции в deploy.sh (SEC-03, DEP-01), неверный ключ капчи в Docker-сборке web (DOCK-01), незащищённый main (CICD-03), 8 critical и 39 high в pnpm audit (CICD-01).
- **Функционально:** волны 1–3 закрыты почти полностью; 5, 7, 8 — частично; волна 4 (Store) и 6 (мини-игры) не начаты. Store: backend широкий, во frontend только каталог, ссылки корзины ведут на 404.
- **Архитектура** пригодна для одного инстанса, не для горизонтального масштабирования: throttler в памяти, нет Redis-адаптера Socket.IO, таймеры без распределённого lock, синхронные массовые рассылки.
- **RBAC зрелый:** 266 из 494 маршрутов под RequirePermissions и обоими guard, расхождений нет; риск латентный (allow-by-default). 2FA реализована качественно, но admin-2FA молча отключается без ключа.
- **Агентная организация:** 26 агентов сохранены; модели закреплены (коммит 2c502ae), вступят в силу после перезапуска сессии.

## 2. Repository and GitHub Status

| Пункт | Значение | Метка |
|---|---|---|
| Репозиторий | younaxo/twomcsu-wsite, публичный | CONFIRMED |
| main | 7bc8868; **branch protection отсутствует, rulesets 0** | CONFIRMED [Chief ✓] |
| PR #139 | chore/windows-zed-claude-setup -> main: OPEN, MERGEABLE/CLEAN, 5/5 checks SUCCESS; 26 агентов и исправление Markdown присутствуют | CONFIRMED [Chief ✓] |
| Ветка этапа | chore/phase-02-agent-config-audit (поверх #139), коммиты в разделе 19, не отправлена | CONFIRMED |
| Dependabot PR | #7, #9, #14, #17 — зелёные; #10–#13, #15, #16 — красные; #138 — красный (Prisma 7) | CONFIRMED |
| gh | токен владельца: scopes repo, workflow; admin на репозиторий | CONFIRMED [Chief ✓] |
| Чужие изменения (сохранены, не коммитились) | M .claude/settings.json — удалены disableBypassPermissionsMode и disableAutoMode; untracked: 13 legacy-агентов, minecraft-menu/, 02-FULL-PROJECT-AUDIT.md, файл «how --stat --oneline HEAD» | CONFIRMED |

## 3. Agent Organization and Model Configuration

- 26 определений twomc-* загружаются Claude Code (все 25 подчинённых доступны в сессии Chief) — CONFIRMED.
- **Модели (коммит 2c502ae):** twomc-chief — opus; 23 агента — sonnet; twomc-specialist-documentation и twomc-owner-liaison — haiku. Использованы только алиасы, которые принимает Claude Code.
- **Проверка применения:** агент без явной модели в текущей сессии запустился на claude-opus-5-5 — определения читаются при старте сессии. Изменение **вступит в силу после перезапуска** claude --agent twomc-chief; тест повторить после перезапуска. В этой сессии модель sonnet задавалась явно при каждом делегировании.
- Глубина 3, параллельность 3 (.claude/settings.json). В аудите одновременно работало не более 3 агентов.
- **Legacy (13 файлов в корне .claude/agents/):** дублируют роли под другими именами, у всех inherit (Opus), executor-* имеют Edit/Write, chief-of-staff образует параллельную иерархию. В сессии --agent twomc-chief не видны (allowlist), в обычной сессии claude видны все 39 и могут быть выбраны автоматически. Ссылок на них в CLAUDE.md, правилах и промптах нет. **Предложение:** перенести в .claude/agents-archive/legacy/ (не загружается, обратимо). Не выполнено — нужно решение владельца.
- Расход подагентов по уведомлениям (токены): Engineering 49k, Quality & Security 135k, Platform 106k, Product & Design 95k, тест модели 8k. Данные /usage и остаток лимитов недоступны.

## 4. Architecture Assessment

| ID | Sev | Находка | Evidence | Метка |
|---|---|---|---|---|
| ARCH-01/02 | High | Оплата и создание заказа не атомарны: PENDING читается вне транзакции, параллельные вебхуки увеличивают usedCount, повтор promoCodeUsage даёт 500, PENDING без TTL | store/orders.service.ts:101-139, 319-358 | CONFIRMED [Chief ✓] |
| ARCH-08 | High | Нет горизонтального масштабирования: throttler в памяти, Socket.IO без Redis-адаптера, visibility в памяти процесса | app.module.ts:54, websocket-adapter.ts, notifications.gateway.ts:39 | CONFIRMED |
| ARCH-10 | High | Массовые рассылки синхронно в запросе, SMTP внутри запроса | admin-notifications.service.ts:21-35, dashboard.service.ts:84-100, announcements.service.ts:353-380 | CONFIRMED |
| ARCH-03 | Med | refund и cancel только меняют статус, Wallet не трогается | orders.service.ts:452-466 | CONFIRMED |
| ARCH-04 | Med | Refresh rotation не атомарна (= SEC-10) | auth.service.ts:405-453 | CONFIRMED |
| ARCH-05 | Med | Гонка лимита участников события | events.service.ts:155-175 | CONFIRMED |
| ARCH-06 | Med | Нет enableShutdownHooks | grep пуст | CONFIRMED [Chief ✓] |
| ARCH-09 | Med | Фоновые таймеры без распределённого lock (кроме SET NX у сборщика статусов) | storage-retention.scheduler.ts, files.service.ts:330 | CONFIRMED |
| ARCH-11/12 | Med | Тяжёлые синхронные операции (checkAllUsers; bought-together без take); SLP-пинг на каждый запрос /servers/:slug/players | achievement-progress.service.ts:268-290, products.service.ts:92-101 | CONFIRMED |
| ARCH-16 | Med | Нет глобального exception filter: P2002/P2025 обрабатываются точечно в 10 файлах, гонки дают 500 | grep | CONFIRMED |
| ARCH-13/14 | Low | Дубли паттернов таймеров и fan-out; findMany по User целиком | direct-messages.service.ts:217, 365 | CONFIRMED |
| ARCH-15 | — | Опровергнуто: forwardRef и DI-цикла Notifications–Auth нет | grep пуст | CONFIRMED [Chief ✓] |

Пути backend даны относительно apps/api/src/modules/ (кроме app.module.ts и websocket-adapter.ts в apps/api/src/).

## 5. Backend Functional Matrix

| Статус | Модули |
|---|---|
| COMPLETE (код и тесты, тесты прошли) | auth (включая refresh rotation и 2FA), roles/RBAC, users, profiles, skins, friends, comments, activity, direct-messages, chat, minecraft-link, news, topics, voting, forms, communications, files, audit, health, link-preview |
| PARTIAL | notifications (дайджест не реализован, notifications.service.ts:107); email (без SMTP молчит); store (69 эндпоинтов, unit-тестов нет, e2e store-checkout); wallet (только чтение, version не используется); minecraft/servers (нет приёма статистики от плагина); events (гонка лимита); reports/moderation; achievements (нет писателя PlayerStatistics); admin/system; streaming (без UI и ключей) |
| BLOCKED | payments — только TestPaymentProvider, провайдер не выбран (R2) |
| NOT STARTED | inventory, Level System, мини-игры, удаление аккаунта (1.8), смена e-mail (1.9), поиск пользователей (2.7), cookie-consent API (8.5) |

COMPLETE означает: код и тесты есть, тесты прошли локально и в CI; рантайм production не проверялся.

**API есть — UI нет (CONFIRMED по клиентским путям):** весь store admin (products, categories, bundles, currencies, discounts, promocodes, stats); мутации корзины, checkout, заказы, wishlist; /admin/streams; moderation/users и очереди comment-reports, profile-reports; /admin/support/donations; /admin/notifications; CRUD /admin/chat/channels; /admin/system/status; /servers/:slug/players, /servers/widget; /users/me/decorations; /news/popular, tags, categories, featured.

## 6. Frontend Functional Matrix

| Раздел | Страница | Реальный API | Примечание |
|---|---|---|---|
| Главная | есть | да | «Подробная инструкция» — заглушка (quick-start.tsx:103-113) |
| Регистрация и вход | есть | да | Minecraft-шаг, 2FA, соцвход Discord и Telegram |
| Профиль | есть | да | — |
| Настройки (8 страниц) | есть | да | empty-состояние только у punishments и showcase; брейкпоинты слабее у media, notifications, privacy, punishments (эвристика) |
| Друзья, ЛС, уведомления | есть | да | токен сокета берётся при монтировании (INFERRED) |
| Чат | плавающая панель | да | отдельной страницы нет |
| Новости, события, формы | есть | да | — |
| Голосование | есть | да | только список сайтов; img вместо next/image (vote/page.tsx:47) |
| Магазин | только каталог | да | нет «в корзину» |
| Корзина и заказы | **нет** | — | ссылки на /shop/cart и /shop/checkout ведут на 404 (floating-actions.tsx:120,123) [Chief ✓] |
| Привязка Minecraft | при регистрации и /site-connect/[token] | да | управления привязкой в настройках нет |

Общее: моки вне design-lab не найдены; валидация ручная (zod и react-hook-form нет); onClick на неинтерактивных элементах не найден; skip-link нет; директива use client в **321** файле [Chief ✓]; единый title на всех страницах [Chief ✓].

## 7. Admin Panel Assessment

- **Рабочие (около 20):** дашборд; пользователи (карточка, роли, bulk, сессии, наказания, бан); медиа-заявки; роли; должности; отделы; новости; события с участниками; темы; формы (ответы, статистика, приглашения); голосование; обращения; достижения; награды; коммуникации; сезонное оформление; серверы; техработы; хранилище; настройки сайта; инструменты.
- **Частичные:** финансы (только чтение и CSV, без возвратов); админ-чат (без CRUD каналов); безопасность, аудит, permissions (только чтение); категории серверов (чтение); два флага настроек с подписью «в разработке», хотя 2FA реализована (site-tabs.tsx:146, 230).
- **Отсутствуют при существующих правах и API:** store, orders, promocodes, streams, очереди жалоб на комментарии и профили, админ-уведомления, support по донату, CRUD категорий серверов, конструктор полей форм.
- Видимость разделов в UI — фильтр PermissionGate и Can; реальная защита серверная (раздел 9).

## 8. Database and Prisma Assessment

- 120 моделей, 54 enum, 21 миграция; последняя 20261011000000_two_factor согласована со схемой статически; prisma validate PASS. migrate diff не запускался (UNVERIFIED).
- Деньги: заказы и промокоды Decimal(10,2); Wallet.balance BigInt плюс version, который не используется для оптимистичной блокировки; Float только у killDeathRatio.
- Каскады: 97 Cascade, 11 SetNull, 0 Restrict — удаление User стирает кошелёк, токены, 2FA и голоса. Политика удаления или анонимизации не определена.
- Soft-delete: deletedAt в 6 моделях, archivedAt в 1 — единой политики нет.
- Индексы: нет индексов на горячих FK OrderItem.productId и Notification.fromUserId; избыточны Order.orderNumber и RefreshToken.tokenHash.
- Retention есть для audit, refresh_tokens, server_status_logs; нет для notifications, activities, email_verifications, lastLoginIp, IP согласий.
- Любые правки индексов и onDelete требуют миграции — запрещено без команды владельца.

## 9. Security Findings

Автоматический перечень: 54 контроллера, 494 маршрута; 266 под RequirePermissions (у всех PermissionsGuard и JwtAuthGuard); 4 мутирующих маршрута без guard — POST /store/quick-buy, /webhooks/payments/:provider, /voting/webhook/:slug, /minecraft/site-connect/open — намеренно публичные, первые два проверены вручную.

| ID | Sev | Находка | Evidence | Метка | Рекомендация |
|---|---|---|---|---|---|
| SEC-01 | **High** | Webhook платежей: дефолтный секрет test-webhook-secret в публичном репо; допускается пустой секрет (пустой с пустым проходит timingSafeEqual); нет HMAC; нет сверки суммы; :provider игнорируется | env.validation.ts:131; orders.service.ts:300-308, 329-351 | CONFIRMED в коде [Chief ✓]; эксплуатация в prod UNKNOWN | обязательный секрет от 32 символов в prod; HMAC сырого тела; сверка суммы и валюты; выбор обработчика по провайдеру |
| SEC-02 | **High** | Нет trust proxy; TRUST_PROXY из compose не читается. За прокси общий IP: общий throttle, брутфорс-блок всех, неверные IP в ПДн | docker-compose.prod.yml:60; auth.controller.ts:51; brute-force.service.ts | факт CONFIRMED, эффект INFERRED | trust proxy с точным числом hop-ов и тест |
| SEC-03 | **High** | Бэкапов Postgres нет; deploy.sh мигрирует до health check, откат без схемы | infrastructure/deploy.sh:49-65 | CONFIRMED в репо; prod UNKNOWN | pg_dump или WAL в RU-S3, restore-runbook, бэкап перед миграцией |
| SEC-04 | Med | Нет Cloudflare real IP (CF-Connecting-IP, set_real_ip_from) | nginx.twomc.su.conf.example:41-62 | INFERRED | real_ip в nginx |
| SEC-05 | Med | Admin-2FA молча выключена без TWO_FACTOR_ENCRYPTION_KEY; WS mute_user и ban_user, маршрут recipients — без 2FA | permissions.guard.ts:41-42; chat.gateway.ts:323-390; communications.controller.ts:39-53 | CONFIRMED | fail-fast в prod; общий 2FA-helper |
| SEC-06 | Med | Cookie-дефолты не принуждаются в prod (COOKIE_SECURE=false, COOKIE_DOMAIN=localhost) | env.validation.ts:31-33 | CONFIRMED | условия для production |
| SEC-07 | Med | Анонимные тяжёлые операции без лимита: quick-buy; анонимная загрузка до 10 МБ в память | orders.controller.ts:20-23; files.controller.ts:44-70 | CONFIRMED | Throttle, captcha, чистка PENDING |
| SEC-08 | Med | Access JWT не привязан к сессии: после logout действует до 15 минут; WS проверяет токен только при handshake | jwt.strategy.ts:28-45; chat.gateway.ts:111-134 | CONFIRMED | проверка sid или ADR о принятии риска |
| SEC-09 | Med | Нет CSP на web | next.config.mjs; middleware.ts отсутствует | CONFIRMED в репо | CSP с nonce, сначала report-only |
| SEC-10 | Low | Refresh не атомарен: две живые сессии при параллельном refresh | auth.service.ts:405-453 | CONFIRMED | updateMany с условием revokedAt null и проверкой count |
| SEC-11 | Low | PermissionsGuard allow-by-default; сейчас дефекта нет | permissions.guard.ts:58-60 | CONFIRMED | CI-тест покрытия admin-маршрутов |
| SEC-12 | Low | Нет WS-лимита на /notifications | notifications.gateway.ts | CONFIRMED | общий лимит на сокет |
| SEC-13 | Low | Email и тело писем (коды, ссылки) в debug-логе вне prod; email в warn при отсутствии SMTP | email.service.ts:40-55 | CONFIRMED | маскирование; срок хранения IP |
| SEC-14 | Low | Dependabot alerts выключены; 2 CodeQL alert в theme.ts:31 — false positive | gh api 403 | CONFIRMED | включить alerts; закрыть alert с обоснованием |
| SEC-15 | Low | Workflows без явных permissions (кроме CodeQL); actions по тегам | .github/workflows | CONFIRMED | permissions contents read; SHA-pinning |
| SEC-16..22 | Info | Без дефектов: SSRF link-preview устойчив; SQLi нет (queryRaw только tagged или Prisma.sql); XSS — markdown без HTML, dangerouslySetInnerHTML только с константой; CORS allowlist корректен, CSRF-риск низкий (access в памяти, SameSite Lax); body limit 100 КБ JSON и 20 МБ multipart; хранение сессий надёжно; восстановление в prod UNKNOWN | — | CONFIRMED | — |

Не проверено: IDOR в 100 мутирующих маршрутах под JwtAuthGuard (кроме files); выдача товара после COMPLETED; реальный prod-конфиг nginx и Cloudflare.

## 10. Test and Build Results

| Проверка | Команда | Результат |
|---|---|---|
| lint api, web, shared | npx eslint (без --fix), npx next lint | PASS |
| format | pnpm run format:check в трёх пакетах | PASS |
| typecheck | pnpm run typecheck в трёх пакетах | PASS |
| prisma validate | npx prisma validate с фиктивным DATABASE_URL | PASS |
| api unit | npx jest | PASS — 20/20 suites, 132/132 (предупреждение о незакрытом воркере) |
| web | npx vitest run | PASS — 100/100 файлов, 545/545 |
| api e2e | — | **BLOCKED** локально; в CI на PR #139 — SUCCESS (DOCUMENTED) |
| build api, web | nest build, npx next build | PASS; R19 безопасен (standalone выключен на Windows, node_modules не тронуты) |

Флейков не обнаружено. Скрипт lint в apps/api содержит --fix (CICD-05).

## 11. CI/CD and Dependencies

- CI: job quality около 4 мин 50 с (unit 70 с, e2e 68 с, build 67 с), кэш pnpm работает. Deploy-workflow нет (CICD-02).
- **CICD-01 (High):** dependency-audit с continue-on-error всегда зелёный, при этом pnpm audit: **critical 8, high 39**, moderate 56, low 11 (по путям). Critical: next (исправлено в 15.5.28 и новее), tar, tinypool, handlebars. Прикладные high: next, nodemailer, multer (через platform-express), body-parser, joi.
- **CICD-03 (High):** main не защищена; токен агента совпадает с токеном владельца с правами admin.
- CICD-04 Docker-образы не собираются в CI; CICD-06 actions по тегам; CICD-07 Dependabot упёрся в лимит 10 PR; CICD-08 Node 20 вне LTS.
- **Причины падения Dependabot PR (CONFIRMED по логам, кроме отмеченных):** #10 TS2322 auth.module.ts:17; #11 TS2345 jwt.strategy.ts:15; #12 TS2741 app.module.ts:47; #13 TS2503 JSX (типы React 19); #15 падение lint (INFERRED: next lint удалён в Next 16); #16 e2e (INFERRED: platform-express 12 при ядре Nest 10); #138 Prisma 7, P1012.
- **Вывод:** Nest обновлять только согласованно одним PR; Next 14 -> 15.5 -> 16 вместе с React 19 и ESLint 9; Prisma 7 — отдельная миграция. Кандидаты без major: joi minor (17.13.9 и новее). Зелёные PR #17 nodemailer (major), #14 ioredis (major), #9 bcrypt, #7 codeql-action — после ревью. Все обновления — по решению владельца (major запрещены этим этапом).

## 12. Infrastructure and Data Residency

**Не юридическое заключение; соответствие 152-ФЗ не утверждается.** Серверы не куплены; production не опрашивался.

| Поток | Сейчас | Цель | Совместимость и что нужно |
|---|---|---|---|
| PostgreSQL | контейнер на хосте | RU-DB-01 | совместимо; TLS или WireGuard, бэкапы в RU-S3 |
| Redis (brute-force, 2FA, кэш прав, presence, WS-лимиты) | контейнер, без TLS в коде | RU | совместимо при размещении рядом с API; refresh-сессии хранятся в Postgres |
| S3 и файлы | local или s3, публичный CDN_BASE_URL | RU-S3 | приватных объектов и подписанных URL нет (UNKNOWN); для приватного S3 нужен отдельный бакет |
| Логи и IP | audit 90 дней; lastLoginIp и IP согласий без срока; логи nginx и docker без лимита | RU | политика сроков хранения |
| Cookies | refresh и 2FA httpOnly; COOKIE_DOMAIN | RU | при .twomc.su refresh-cookie уйдёт на EU-узел — нужен host-only cookie api.twomc.su |
| WebSocket | один инстанс, без Redis-адаптера | RU-01 | API на EU невозможен без адаптера |
| Cloudflare Proxied | подтверждён владельцем | — | **конфликт:** TLS терминируется вне РФ, Cloudflare видит cookies, тела и IP |
| Сторонние API | Turnstile (получает IP), Discord, Telegram OIDC, Mojang, web-push, SMTP (не выбран), favicon-fetch | исходящие с RU-01 | доступность с RU-хоста не проверена |

Чтобы EU-01 не видел сессий: не терминировать TLS на Cloudflare или EU для twomc.su и api.twomc.su; EU-01 — только TCP/SNI passthrough или публичная статика; SSR только на RU-01; host-only cookie.

Варианты в бюджете около 5 000 ₽ (цены не проверялись): **A** — один RU-01 плюс RU-S3 (минимум, Postgres локально); **B** — RU-01, RU-DB-01, RU-S3; **C** — B плюс EU-01 passthrough (бюджет под давлением).

Связанные блокеры деплоя: **DOCK-01** — образ web передаёт NEXT_PUBLIC_HCAPTCHA_SITE_KEY, а код читает NEXT_PUBLIC_TURNSTILE_SITE_KEY (web.Dockerfile:25-29, docker-compose.prod.yml:81, lib/env.ts:29) [Chief ✓]; DOCK-02 dev-зависимости в образе API; DEP-02..06 (ложное «Откат выполнен», .release не в ignore, сборка на prod-хосте, нет лимитов памяти и логов).

## 13. Roadmap Progress — Waves 1–8

Источник: docs/product-audit/ROADMAP.md, сверено с кодом, PR, ADR и CHECKPOINT. Старые галочки не учитывались. Полная посрезовая матрица с evidence — в отчёте Product & Design Director (сводка ниже).

| Волна | DONE | PARTIAL | NOT STARTED | BLOCKED / OWNER |
|---|---|---|---|---|
| 1 Account | 1.1, 1.2, 1.3, 1.5, 1.6, 1.7 | **1.4** — disabled «Избранное» и «Заказы» (mini-profile.tsx:67-68) [Chief ✓], нет пункта «Безопасность и сессии» | — | 1.8 (политика данных), 1.9 (R4) |
| 2 Social | 2.1–2.6 (2.2 с внешними блокерами R4, R7) | 2.8 (только backend) | **2.7** поиск — эндпоинта нет [Chief ✓] | 2.8 — решение о нужности |
| 3 Content | 3.1–3.7 (тексты юрдокументов ждут владельца) | — | — | 3.8 (R6) |
| 4 Store | — | 4.8 (кошелёк только чтение) | — | 4.1–4.10 — **owner gate**; 4.3, 4.9 — R2; 4.4 — R20 |
| 5 Minecraft и геймификация | 5.7, 5.8 | 5.1, 5.3, 5.6 | 5.2, 5.4, 5.5, 5.9, 5.11, 5.12 | 5.10 (R20); 5.13 (гейт Level) |
| 6 Mini-games | — | — | 6.1–6.5 | конфликт порядка с Donation REQUIREMENTS п. 7 |
| 7 Admin | 7.3, 7.5, 7.6, 7.7 | 7.1 (минимум), 7.2, **7.4** (конструктор полей форм) | 7.8, 7.9 | 7.1 привязан к волне 4 |
| 8 System и QA | 8.2, 8.3, 8.4, 8.7, 8.10 (косвенно) | **8.6** (рассылки, экспорт) | 8.5 cookie-consent; **8.8** браузерные e2e — Playwright нет [Chief ✓] | 8.1 (R3, R4, R8, R17, R18); 8.9 (переводы) |

Расхождения требований: Store в roadmap (волна 4) и Store внутри Donation REQUIREMENTS — разделение не зафиксировано ADR; 8.6 требует nestjs/schedule или очередь, фактически setInterval; ADR-0094 (кошелёк только чтение) блокирует 4.8, 5.11, 6.1; единый title (ADR-0126) нарушает WCAG 2.4.2.

## 14. Started but Unfinished Work

Только работа с существующим кодом, PR или ADR.

| Работа | Сделано | Осталось | Объём | Блокер | Без расширения scope |
|---|---|---|---|---|---|
| 1.4 Меню профиля | меню, 2 disabled-пункта | скрыть «Избранное» и «Заказы» до гейта, добавить «Безопасность и сессии» | S | — | да |
| Подписи «в разработке» у флагов 2FA и автомодерации | флаги работают | исправить подписи | S | — | да |
| 7.4 Конструктор полей форм | ADR-0152, ответы, статистика, приглашения | создание формы, редактор 9 базовых типов | L | — | да (следующий шаг по CHECKPOINT) |
| 7.2 UI очередей жалоб | API content-reports | /admin/moderation | M | — | да |
| 5.6 Страница сервера | сборщик, history API | /servers/[slug], график | M | срок хранения истории (решение) | да |
| 8.6 Массовые рассылки в фоне | синхронный communications | таблица заданий, воркер | M | **миграция — команда владельца** | да, после разрешения |
| 8.6 Экспорт по расписанию | ADR-0048 | планировщик, доставка | M | R3, R4 | нет (внешний) |
| Дайджест уведомлений | API digest | отправка | M | R4 | нет (внешний) |
| 5.1 и 5.3 Украшения | схема, me/decorations, показ | каталог, админка, /settings/appearance | L | права на ассеты | частично |
| 2.8 Реакции и просмотры профиля | схема, DTO | UI | M | решение о нужности | после решения |
| Store frontend, 7.1 админка магазина, refund | backend, финансы только чтение | весь UI и логика возврата | L | **hard gate волны 4**, R2, SEC-01 | **нет** |
| DEFERRED из CHECKPOINT (SYSTEM «Пароль изменён», ветки и закреп комментариев, участники группы ЛС, дедуп просмотров, гонка лимита событий, восстановление 2FA и др.) | частично | — | S–M | — | оценка не проводилась |

## 15. External Dependencies and Blockers

R2 платёжный провайдер · R3 S3 и CDN · R4 SMTP и DNS · R6 Twitch и YouTube · R7/R27 VAPID · R8 хостинг · R17 production-ключи Turnstile · R18 Telegram BotFather · R20 Minecraft-плагин и MINECRAFT_PLUGIN_SECRET · R22 источник скинов · R25 лицензия emoji · тексты юрдокументов и оферты · политика хранения данных · юридическая оценка Cloudflare, Turnstile и EU-узла.

## 16. Technical Debt and Performance Risks

- **До реальных платежей:** ARCH-01/02/03, SEC-01, политика удаления пользователей, мёртвые ссылки корзины.
- **До второго инстанса:** ARCH-06/07/08/09/10, Redis-адаптер Socket.IO, Redis storage для throttler.
- **Средний:** ARCH-04/05/11/12/16, retention notifications и activities, индексы FK, SEO и title по страницам.
- **Низкий:** дубли хуков (debounce в 4 копиях, useNow в 5), крупные файлы (admin/users/[id]/page.tsx — 758 строк, register-form.tsx — 720), лишние индексы.
- **Платформа:** PERF-01 — use client в 321 файле (bundle не измерялся); DOCK-02/PERF-02 — размер образа API; DEP-05/PERF-03 — сборка на prod-хосте; DOCK-04 — healthcheck через SSR.
- **Дизайн и доступность (Design Lead):** DES-01 кольцо фокуса в light 2.86:1; DES-02 слабый focus-ring полей; DES-03 нет skip-link; DES-04 единый title; DES-05 subtle-foreground 3.5–4.0:1 (179 мест); DES-06 text-primary как текст 2.86–3.06:1 в light; DES-07/08 недоступное объяснено только tooltip или «Скоро»; DES-12 рамки полей 1.2–2.4:1. Glass и blur отсутствуют; токены, цвета и шрифты соответствуют «Полдню».

## 17. Prioritized Recommendations

**P0 — до любого production-трафика и платежей**
1. SEC-01: обязательный секрет вебхука в prod, HMAC, сверка суммы (существующий код, без запуска магазина).
2. SEC-02, SEC-04, OPS-01: trust proxy по топологии, Cloudflare real IP.
3. DOCK-01: передача NEXT_PUBLIC_TURNSTILE_SITE_KEY в образ web.
4. SEC-03, DEP-01: бэкапы, restore-runbook, бэкап перед migrate deploy (владелец и Platform).
5. CICD-03: ruleset на main и отдельный ограниченный токен агента (docs/agent-prompts/GIT-WORKFLOW-PERMISSIONS-PROPOSAL.md v2).
6. SEC-05, SEC-06: fail-fast проверки prod-env (2FA-ключ, cookie).

**P1**
7. CICD-01: план устранения critical и high (Next 15.5.28+, multer через Nest, nodemailer #17, joi minor) — отдельные согласованные PR.
8. Завершение начатого без расширения scope: 1.4, подписи флагов, 7.4 конструктор, 7.2 UI очередей, 5.6.
9. SEC-07, SEC-08, SEC-10; ARCH-04, ARCH-05, ARCH-16.
10. DES-01..06 (фокус, контраст, skip-link, title) — с решением владельца по бренд-цвету.
11. CICD-05 (lint без --fix в CI); SEC-11 CI-тест покрытия guard.

**P2**
12. 8.6 рассылки в фоне (после разрешения миграции); ARCH-08/09/10 для многоинстансности.
13. 8.8 Playwright и axe; retention; индексы (миграции — по команде).
14. Legacy-агенты в архив; CICD-06/07/08, DOCK-02/04, DEP-02..06.

**P3**
15. Дубли хуков и крупные файлы, лишние индексы, ARCH-13/14, bundle-анализ.

## 18. Proposed Phase 03 Plan (FINISH INCOMPLETE WORK)

Предложение; запуск только по команде владельца. Каждый пункт — отдельная ветка и PR; merge выполняет владелец.

| Шаг | Содержание | Ветка | Исполнители | Условие |
|---|---|---|---|---|
| 03.0 | Перезапуск сессии и проверка моделей; применение Git-workflow (токен, ruleset, правила) | — | владелец | решения 1–3 раздела 20 |
| 03.1 | P0 в существующем коде: SEC-01, SEC-02/04, SEC-05/06, DOCK-01, SEC-10 | fix/security-hardening | Engineering -> Backend Lead -> nest-prisma; Platform для Docker; независимая проверка Q&S | без миграций |
| 03.2 | Мелкие незавершённые: 1.4 меню, подписи флагов | fix/profile-menu-settings-labels | Engineering -> Frontend Lead -> react-next | — |
| 03.3 | 7.4 конструктор полей форм | feature/admin-form-builder | Engineering (Backend и Frontend Lead) | соблюдать ADR-0152 |
| 03.4 | 7.2 UI очередей жалоб; 5.6 страница сервера | feature/admin-moderation-queues, feature/server-page | Engineering | решение по сроку хранения истории |
| 03.5 | Зависимости без major: joi minor, #9, #7; #17 и #14 — после ревью | chore/deps-* | Platform -> DevOps | без major Nest, Next, Prisma |
| 03.6 | 8.6 рассылки в фоне | feature/background-mailing | Engineering | **разрешение на миграцию** |

Вне Phase 03 без отдельного решения: волна 4 и Store, Donation Privileges, Level System, мини-игры, новые платёжные интеграции, плагины, major-миграции Nest, Next, Prisma, деплой.

## 19. Git Changes and PR Links

Ветка chore/phase-02-agent-config-audit (основа — PR #139, 477f52b), **не отправлена**: git push запрещён действующими правилами .claude/settings.json, обход не выполнялся.

| Коммит | Содержание |
|---|---|
| 2c502ae | chore: закрепить модели агентов TwoMC вместо inherit (26 файлов, только строки model) |
| b9c79fb | docs: предложение прав Git-workflow и контрольная точка аудита |
| c12fbbd | docs: учесть ревью прав Git-workflow, обновить контрольную точку аудита |
| следующий | docs: отчёт FULL PROJECT AUDIT этапа 02 (этот файл и итог контрольной точки) |

Связанные PR: #139 (OPEN, ждёт решения о merge). Новый PR не создан. Команда для владельца: git push -u origin chore/phase-02-agent-config-audit, затем PR с base chore/windows-zed-claude-setup (или main после merge #139).

## 20. Outstanding Owner Decisions

1. Merge PR #139, затем PR этого этапа.
2. Git-workflow: отдельный ограниченный токен, ruleset на main, правила v2; намеренно ли удалены disableBypassPermissionsMode и disableAutoMode в .claude/settings.json.
3. Архивирование 13 legacy-агентов в .claude/agents-archive/legacy/.
4. Запуск Phase 03 и его состав (раздел 18).
5. Волна 4 (Store) и её соотношение с Donation Privileges; порядок мини-игр и Donation (конфликт ROADMAP и Donation REQUIREMENTS п. 7); источник истины баланса.
6. Платёжный провайдер (R2), оферта и политика возвратов.
7. Разрешение на миграции: фоновые рассылки (8.6), индексы, retention, политика удаления пользователей.
8. Топология A, B или C; Cloudflare Proxied или passthrough; юридическая оценка Turnstile, Cloudflare и EU-01.
9. Политика зависимостей: согласованные миграции Nest 12, Next 15/16 с React 19, Prisma 7, Node 22/24; ignore major в Dependabot; убрать continue-on-error у audit; включить Dependabot alerts; закрыть 2 CodeQL alert как false positive.
10. Есть ли бэкапы на хосте; заданы ли в prod PAYMENT_WEBHOOK_SECRET, TWO_FACTOR_ENCRYPTION_KEY, COOKIE_SECURE, COOKIE_DOMAIN и ключи Turnstile.
11. Продуктовые: нужны ли 2.8 реакции, UI streaming, управление привязкой Minecraft в настройках; награды 5.11 и 5.12; срок хранения истории статусов (ADR-0147); positions.assign (ADR-0140); бренд-цвет для контраста в light.
12. Внешние ресурсы: R3, R4, R6, R7, R8, R17, R18, R20; тексты юрдокументов.
