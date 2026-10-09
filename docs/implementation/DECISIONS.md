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

## ADR-0014 — CI: dependency audit информативен на старте

**Context.** `pnpm audit --audit-level=high` на пустом/свежем workspace уже может
показывать advisories на транзитивных зависимостях инструментов (Next.js/NestJS
CLI и т.д.), которые нельзя исправить точечно без апдейта всего фреймворка.
Сделать шаг блокирующим прямо на PHASE 02 означало бы либо немедленно глушить его
`eslint-disable`-подобным образом, либо блокировать весь CI по чужому транзитивному
advisory до апдейта фреймворка.

**Decision.** На старте (`.github/workflows/ci.yml`, job `dependency-audit`) шаг
выполняется с `continue-on-error: true` — результат виден в логах CI, но не
блокирует merge. Ужесточается (убирается `continue-on-error`) на PHASE 26
(Security hardening) после разового ревью найденных advisories и фиксации
исключений (если понадобятся) в `pnpm audit` allowlist.

## ADR-0015 — Валидация переменных окружения: инкрементально, а не всё сразу

**Context.** `docs/technical/42-TECH-DEBT.md` отмечает отсутствие валидации env
при старте как проблему старого проекта (значения по умолчанию заданы в коде,
`JWT_*_SECRET` по умолчанию `''`). `.env.example` (PHASE 01) уже перечисляет
полный целевой список переменных (включая те, что понадобятся только в PHASE 05+).

**Decision.** `apps/api/src/config/env.validation.ts` (Joi-схема,
`ConfigModule.forRoot({ validationSchema })`) валидирует **только переменные,
которые реально читает существующий код** (`DATABASE_URL`, `API_PORT`,
`NODE_ENV` на момент PHASE 04). Схема расширяется в той же фазе, что добавляет
код, использующий новую переменную (например `JWT_ACCESS_SECRET` — вместе с
PHASE 05 Authentication), а не заранее списком из `.env.example`. Так схема
валидации никогда не рассогласуется с фактически используемыми переменными и
не создаёт ложного впечатления, что что-то уже подключено, когда это не так.

## ADR-0016 — Реестр permissions наполняется по доменным фазам, а не сразу

**Context.** `docs/technical/11-PERMISSION-MATRIX.md` описывает 246 ключей по
47 модулям — но на PHASE 06 в коде существуют только Auth и сам RBAC-модуль;
подавляющее большинство ключей матрицы относится к модулям, которые ещё не
реализованы (store, chat, news, reports и т.д.).

**Decision.** `prisma/seed/permissions.ts` на PHASE 06 содержит только 7 ключей
модуля `roles` (`roles.view|create|edit|delete|assign|history.view`,
`permissions.manage`) — ровно то, что реально защищает `RolesController`/
`UserRolesController` в этом коммите. Каждая следующая доменная фаза добавляет
**свои** ключи в `PERMISSIONS` вместе со своими endpoints (а не весь реестр
из 11-PERMISSION-MATRIX.md заранее одним PR) — так `PERMISSIONS` и код всегда
синхронны, и в БД никогда нет permission, которую ничего не проверяет.
Нормализация артефактов автогенерации матрицы (`misc.view`→`dashboard.view`
и т.п., см. 11-PERMISSION-MATRIX.md «Замечания») применяется в момент, когда
соответствующий модуль реализуется, а не заранее.

**Роли:** на PHASE 06 заведены только 3 superuser-роли (`Owner`,
`Chief Curator`, `Chief Developer` — `isSuperuser=true`, `isSystem=true`,
см. ADR-0005/ADR-0006). Staff-роли уровня Admin/Moderator/Helper создаются в
PHASE 32 вместе с bootstrap-аккаунтами, когда уже есть реальные permissions
доменных модулей, которые им имеет смысл назначать.

## ADR-0017 — WebSocket CORS: единый адаптер вместо опции `cors` в `@WebSocketGateway`

**Context.** `docs/technical/06-WEBSOCKET.md` и `29-SECURITY.md` (S11, LOW)
фиксируют, что в старом проекте namespace `/messages` был настроен с
`cors.origin = true` (разрешён любой origin), в то время как `/chat` и
`/notifications` использовали origin из конфигурации — рассинхронизация
между гейтвеями, заведёнными в разное время разными людьми. Технически
опция `cors` в декораторе `@WebSocketGateway({ cors: {...} })` вычисляется
при импорте модуля гейтвея — раньше, чем `AppModule` успевает выполнить
`ConfigModule.forRoot()` и заполнить `process.env` из `.env`, поэтому чтение
`ConfigService`/`process.env` прямо в декораторе ненадёжно (значение ещё не
загружено на момент вычисления decorator-metadata).

**Decision.** CORS для всех Socket.IO namespace (включая будущие `/chat` и
`/notifications`, PHASE 11/12) настраивается в одном месте —
`apps/api/src/websocket-adapter.ts` (`ConfigurableIoAdapter extends IoAdapter`),
который переопределяет `createIOServer` и подставляет `cors: { origin: WEB_ORIGIN,
credentials: true }` уже после того, как Nest создал application context (когда
`ConfigService` гарантированно доступен). Адаптер регистрируется в
`configureApp()` (`apps/api/src/configure-app.ts`) — общей точке bootstrap для
`main.ts` и всех e2e-тестов, так что production и тесты ведут себя одинаково.
Это одновременно устраняет S11 для всего приложения разом, а не только для
`/messages`, и не допускает повторения той же рассинхронизации для будущих
namespace.

## ADR-0018 — Socket-события Direct Messages: собственные DTO поверх REST DTO

**Decision.** REST-эндпоинты `/messages/*` (PHASE 10) переиспользуют один
набор DTO (`SendMessageDto`, `EditMessageDto`, `ReactMessageDto` и т.д.) с
`conversationId`/`messageId` в URL. WebSocket-события `/messages` namespace
принимают `conversationId`/`messageId` в теле сообщения (payload), поэтому
заведены отдельные socket-DTO (`apps/api/src/modules/direct-messages/dto/socket/*`),
которые **расширяют** (`extends`) соответствующий REST DTO и добавляют только
недостающее поле идентификатора — чтобы правила валидации контента (`@Length`,
`@IsString`) не дублировались и не могли разойтись между REST и WS путями.
Валидация на WS-слое подключена тем же `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true, transform: true })`, что и глобально на HTTP
(`@UsePipes` на уровне класса гейтвея), — WS-клиент получает те же гарантии
против mass assignment, что и REST-клиент.

## ADR-0019 — Notifications: грубый profile-флаг vs точный per-type override

**Context.** В схеме есть два независимых механизма контроля уведомлений:
`User.notifyOn*` (заведены в PHASE 08 вместе с профилем — `notifyOnComment`,
`notifyOnMention`, `notifyOnReply`, `notifyOnFriendRequest`, `notifyOnGift`,
`notifyOnOrder`) и `NotificationSettings.typeSettings` (JSON-карта
`{ [NotificationType]: boolean }`, PHASE 12). Используются оба одновременно —
это не дублирование, а два разных уровня детализации.

**Decision.** `User.notifyOn*` — грубый переключатель ЦЕЛОЙ категории,
проверяется **доменным сервисом** (`FriendsService`, `CommentsService`,
`ActivityService`) ДО вызова `NotificationsService.create()` — он решает,
стоит ли вообще пытаться уведомить. `NotificationSettings.typeSettings[type]`
— точный переключатель ОДНОГО конкретного `NotificationType`, проверяется
**внутри** `NotificationsService.create()` как последний рубеж (например
можно включить комментарии в целом, но выключить конкретно
`ACTIVITY_COMMENT_MENTION`). Если оба проверяют одно и то же для каких-то
типов — это осознанная избыточность в пользу UX (профиль даёт быстрый
грубый тумблер, настройки уведомлений — тонкую настройку), а не ошибка.

Личные (per-user) каналы доставки (`emailEnabled`/`pushEnabled`/
`discordEnabled`, quiet hours, `digestMode`) проверяются **после** обоих
вышеописанных гейтов, уже в `deliver()` — они решают не "создавать ли
запись", а "каким каналом её доставить", и не влияют на WS realtime и на
саму запись в БД (она создаётся всегда, если оба гейта пройдены — иначе
непрочитанные уведомления не накапливались бы для дайджеста при
отключённом email).

## ADR-0020 — Discord webhook URL: allowlist домена против SSRF

**Context.** И личный вебхук пользователя (`POST /notifications/discord/
webhook`), и системный вебхук админа (`POST /admin/notifications/webhooks`)
принимают произвольный URL от клиента, на который backend сам делает
исходящий HTTP POST (`fetch`) — классический SSRF-вектор (можно подставить
внутренний адрес вместо `discord.com` и прозондировать внутреннюю сеть).

**Decision.** `apps/api/src/modules/notifications/discord-webhook-url.util.ts`
(`isValidDiscordWebhookUrl`) разрешает только `https://` на хостах
`discord.com`/`discordapp.com` с путём, соответствующим формату
`/api/webhooks/{id}/{token}`. Проверка применяется в **обоих** местах, где
URL попадает в систему: `DiscordService.createWebhook/updateWebhook` (admin)
и `NotificationSettingsService.saveDiscordWebhook` (личный) — т.е. до записи
в БД, а не только перед отправкой, чтобы невалидный URL не мог быть
сохранён вообще. `class-validator`-уровня `@IsUrl()` в DTO сознательно НЕ
используется для этой проверки (проверяет только общую корректность URL,
не домен) — allowlist-проверка живёт в сервисе как бизнес-правило, по той
же логике, что и остальные доменные проверки в проекте (например
`directMessagePolicy`).

## ADR-0021 — Activity: новые типы уведомлений вместо переиспользования profile-типов

**Context.** `NotificationType` не содержал типа для "кто-то прокомментировал
вашу запись активности" или "вас упомянули в комментарии к активности" —
ближайшие по смыслу `COMMENT_ON_PROFILE`/`COMMENT_MENTION` описывают именно
комментарии **на профиле** (`ProfileComment`), не к ленте активности
(`ActivityComment`) — у этих моделей разные владельцы (профиль vs запись
активности) и разный `link` в уведомлении.

**Decision.** Добавлены `ACTIVITY_COMMENT`/`ACTIVITY_COMMENT_MENTION` в
`NotificationType` (миграция `20261004144405_add_activity_notification_types`,
добавление enum-значений — не breaking, данных не теряет). Это соответствует
уже существующему в схеме паттерну разделения по домену (`NEWS_COMMENT_REPLY`/
`NEWS_COMMENT_MENTION` отдельно от `COMMENT_REPLY`/`COMMENT_MENTION`).
`ActivityComment` не имеет поля `mentions` в схеме (в отличие от
`ProfileComment`/`ChatMessage`) — упоминания для целей уведомления
вычисляются на лету (`extractMentions`), не сохраняются персистентно,
т.к. единственный потребитель этих данных — сама рассылка уведомления в
момент создания комментария.

## ADR-0022 — Периодический дайджест и TTL-based push-presence не входят в PHASE 12

**Context.** `NotificationSettings.digestMode` (`HOURLY`/`DAILY`/`WEEKLY`)
и `POST /notifications/digest/test` предполагают периодическую агрегацию
непрочитанных уведомлений по расписанию.

**Decision.** PHASE 12 реализует только **ручной** триггер
(`sendDigestForUser`, вызывается через `/notifications/digest/test`) —
честная, не-заглушечная проверка "как будет выглядеть дайджест" (реальный
email с реальным списком непрочитанных). Реальный периодический cron,
который сам решает, когда у кого наступило время дайджеста согласно
`digestMode`/`digestTime`, требует фоновых задач с распределённой
блокировкой (чтобы два инстанса API не отправили дайджест дважды) — это
прямо соответствует PHASE 29 (Background jobs) и реализуется там, а не
здесь через `setInterval`-подобный костыль в рамках HTTP-модуля.

## ADR-0023 — News: явный slug от автора, архивация вместо удаления, ручной scheduling

**Decision.** `CreateNewsDto.slug` задаётся явно автором (не
автогенерируется транслитерацией заголовка) — та же логика, что и у
`ChatChannel.slug` (ADR из PHASE 11): явный slug проще, предсказуемее и не
требует транслитератора кириллицы. `DELETE /admin/news/:id` не удаляет
запись, а переводит `status` в `ARCHIVED` (`news.archive()` в старом
API-REFERENCE) — у новости есть просмотры/лайки/комментарии, которые
нельзя обессмысливать хард-делитом; архив по-прежнему виден админу через
`/admin/news`, но не публично.

`NewsStatus.SCHEDULED` + `scheduledFor` принимаются и сохраняются при
создании/редактировании, но автоматический переход `SCHEDULED → PUBLISHED`
по расписанию не реализуется в этой фазе — требует фоновой задачи (cron,
PHASE 29), как и периодический digest уведомлений (ADR-0022). Редактор
переводит статус вручную через `PATCH /admin/news/:id`.

`GET /news/popular` сортирует по `viewsCount` за всё время — в схеме нет
отдельной time-windowed агрегации просмотров (`NewsView` хранит
исторические строки, но group-by по периоду не агрегируется заранее);
пересмотр метрики — PHASE 34 (Performance), если понадобится «популярное
за неделю».

`GET /rss/news` генерирует RSS 2.0 вручную (без отдельной npm-библиотеки)
— формат достаточно простой (список `<item>` с title/link/guid/description/
pubDate), чтобы не оправдывать новую зависимость ради генерации XML-строки.

`NewsComment` не имеет поля `mentions` в схеме (как и `ActivityComment`,
см. ADR-0021) — `NEWS_COMMENT_MENTION` вычисляет упоминания на лету через
`extractMentions`, не сохраняя их персистентно.

## ADR-0024 — Events/Topics/Voting/Streaming: видимость по permission вместо RoleGroup

**Context.** `CalendarEvent.visibility` (PUBLIC/AUTHENTICATED/STAFF) и
`Topic.visibility` (PUBLIC/AUTHENTICATED/HELPER_ONLY/MODERATOR_ONLY/
ADMIN_ONLY/OWNER_ONLY) в старом проекте проверялись через RoleGroup-
иерархию, которой в целевой архитектуре нет (ADR-0004).

**Decision.** Каждый непубличный уровень видимости (кроме AUTHENTICATED,
который означает просто «любой залогиненный») получил собственный
permission-ключ: `events.view.staff`, `topics.view.helper`/`.moderator`/
`.admin`/`.owner`. Проверка видимости — `PermissionService.hasPermission`,
не сравнение ролей/приоритетов — соответствует ADR-0004 («никаких
`if (role === 'ADMIN')` вне PermissionService»). Список (`listPublic`)
фильтрует по видимости на уровне запроса, где это дёшево (события — через
`visibility: {in: [...]}` в `where`), либо постфильтром после загрузки
(темы — обычно их мало, лишняя нагрузка пренебрежимо мала).

## ADR-0025 — Voting: webhook-секрет как bcrypt-хеш, не HMAC-подпись

**Context.** `VoteSite.webhookSecretHash` нужно использовать для проверки
подлинности входящего webhook от внешнего vote-сайта. Два очевидных
подхода: (а) HMAC-подпись всего тела запроса, которую сервер пересчитывает
и сравнивает — но для этого нужен **сырой** секрет на сервере, а не его
хеш; (б) простой shared-secret токен в теле запроса, сравниваемый через
`bcrypt.compare` с хешем.

**Decision.** Выбран вариант (б) — название поля (`*Hash`) и общий паттерн
проекта (пароли уже хранятся как bcrypt-хеш, не обратимо) делают именно
этот подход согласованным с остальной кодовой базой. `VoteWebhookDto`
принимает `secret` в теле; сырой секрет генерируется (`randomBytes(32)`)
и возвращается администратору ровно один раз — при создании сайта и при
`rotate-secret` — после чего существует только как bcrypt-хеш. Webhook
всегда отвечает `200 { accepted, reason? }`, никогда не 4xx/5xx для
бизнес-отказов (неверный секрет/юзер не найден/cooldown) — внешние
vote-сайты типично агрессивно ретраят non-2xx ответы.

## ADR-0026 — Streaming: refresh честно не реализован без credentials

**Context.** `POST /admin/streams/refresh` в целевом поведении должен
опрашивать Twitch Helix / YouTube Data API и обновлять `isLive`/
`viewerCount` в `StreamChannel`. `TWITCH_CLIENT_ID/SECRET`/`YOUTUBE_API_KEY`
— внешний блокер (RISKS.md R6), в этом окружении не предоставлены.

**Decision.** `UpdateStreamChannelDto` намеренно не включает `isLive`/
`viewerCount`/`title`/`thumbnailUrl`/`liveUrl`/`startedAt` — эти поля
отражают факт из внешнего API, ручной PATCH не должен позволять
администратору создать фальшивый «live»-статус. `refresh()` реализован
так, чтобы честно возвращать `{refreshed: false, reason}` (нет
credentials — `no_platform_credentials_configured`; credentials
есть, но сама интеграция ещё не написана — `not_implemented`), а не
тихо ничего не делать или использовать моковые данные. Реальный опрос
API и периодический cron — PHASE 18/29, когда появятся credentials.

## ADR-0027 — Forms: доменные reference-поля валидируются по готовности домена

**Context.** `FormFieldType` содержит 33 значения, среди которых 8 —
ссылки/селекторы на домены, часть которых на момент PHASE 15 ещё не была
реализована: `PLAYER_SELECTOR`/`SERVER_SELECTOR`/`RANK_SELECTOR`
(Minecraft-серверы), `PRODUCT_SELECTOR`/`ORDER_SELECTOR` (магазин),
`REPORT_REFERENCE`/`PUNISHMENT_REFERENCE` (жалобы/наказания),
`ACHIEVEMENT_SELECTOR` (геймификация, PHASE 19 — всё ещё не реализована).
`NEWS_REFERENCE`, `TOPIC_REFERENCE` и `FRIENDS_SELECTOR` ссылались на уже
реализованные домены (News — PHASE 13, Topics — PHASE 14, Friends —
ранняя фаза) и сразу получили реальную проверку.

**Decision.** `FormsService.buildAnswerData()` проверяет существование и
актуальность только для доменов, у которых есть модель в схеме:
`NEWS_REFERENCE` требует `News.status === PUBLISHED`, `TOPIC_REFERENCE` —
`Topic.isActive === true`, `FRIENDS_SELECTOR` — `FriendsService.isFriend(
viewerId, value)` (пропускается для анонимного `viewerId`). При PHASE 18
(Minecraft servers) добавлена реальная проверка `SERVER_SELECTOR` —
`Server.isActive === true` (прямой запрос через `PrismaService`, без
отдельного сервиса — как у `NEWS_REFERENCE`/`TOPIC_REFERENCE`).
Остальные селекторы по-прежнему принимаются без referential-проверки —
`PLAYER_SELECTOR`/`RANK_SELECTOR` не получат её вовсе (в схеме нет
соответствующих моделей — не планируется); `PRODUCT_SELECTOR`/
`ORDER_SELECTOR` (Store, PHASE 17) и `REPORT_REFERENCE`/
`PUNISHMENT_REFERENCE` (Reports, PHASE 16) технически уже МОГУТ быть
проверены (модели существуют), но это не было сделано в соответствующих
фазах и намеренно не добавлено задним числом в PHASE 18 — чтобы не
смешивать несвязанный рефактор Forms в фазу Minecraft servers; это
зафиксированный, осознанный technical debt для отдельного прохода, а не
забытая работа. `ACHIEVEMENT_SELECTOR` ждёт PHASE 19. Это не заглушка и
не моковые данные — значение реально хранится и возвращается, просто без
дополнительной проверки существования. Решение централизовано в одном
месте (`buildAnswerData`).

## ADR-0028 — Forms: FormFieldAnswer как Unchecked create/upsert, без `field`/`response` relation input

**Context.** `FormFieldAnswer` хранит значение одного поля одного ответа
и ссылается на `FormField`/`FormResponse` через `fieldId`/`responseId`.
Prisma для вложенного `create` (`FormResponse.create({data: {answers:
{create: [...]}}})`) и для top-level `upsert` (используется в
`saveDraft` для апдейта черновика без создания дублей — см. unique-
индекс `@@unique([responseId, fieldId])`) предлагает на выбор checked-
вариант типа (с вложенным `field: {connect: {id}}`/`response: {connect:
{id}}`) и unchecked-вариант (плоский `fieldId`/`responseId`).

**Decision.** Везде используется unchecked-форма: `fieldId`/`responseId`
передаются как обычные скалярные поля, а не через вложенный `connect`.
Причина чисто техническая — `buildAnswerData()` возвращает значение поля
без знания, создаётся ли ответ (`submitResponse`, formId уже есть в
транзакции) или апдейтится черновик (`saveDraft`, нужен только
`fieldId`), и собственный тип `FieldAnswerValues` (вместо генерируемого
Prisma-типа `FormFieldAnswerCreateWithoutResponseInput`, который требует
вложенный `field`) позволяет переиспользовать один и тот же метод для
обоих путей без дублирования веток checked/unchecked.

## ADR-0029 — Reports/Moderation: `users.change_role` не переносится — заменено RBAC-эндпоинтами PHASE 06

**Context.** Старый `POST /admin/users/:userId/change-role` менял
единственное значение `RoleGroup` у пользователя. Новая RBAC-модель
(ADR-0004) — many-to-many `UserRole`, без понятия «единственная роль».
`/admin/users/:userId/roles/:roleId` (POST/DELETE, PHASE 06,
`user-roles.controller.ts`) уже полностью покрывает назначение/снятие
ролей, включая множественные роли и историю изменений.

**Decision.** `users.change_role` не реализуется как отдельный эндпоинт
— это не урезание функциональности, а устранение дублирующего,
архитектурно устаревшего интерфейса поверх уже существующего, более
гибкого API. Переход пользователя между ролями выполняется через
`POST/DELETE /admin/users/:userId/roles/:roleId`. `users.delete`
(полное удаление аккаунта) реализован отдельно — это не про роли.

## ADR-0030 — Quick Moderation и Punishments: один источник данных (`UserPunishment`), два входа

**Context.** `QuickModerationController` (`/moderation/users/:userId/
mute|warn|kick|ban`) — быстрые действия в один клик из контекста
(например, из карточки сообщения в чате). `PunishmentsController`
(`/admin/users/:userId/punishments`) — более гибкий инструмент с явным
выбором `PunishmentType`/`duration`/`server`/`expiresAt` из карточки
пользователя в админке. Оба в итоге создают записи в одной и той же
истории наказаний.

**Decision.** `QuickModerationService` создаёт `UserPunishment`
напрямую (не переиспользует `PunishmentsService` — модули `moderation`
и `reports` не имеют циклической зависимости друг на друга, а логика
quick-действий тривиальна: одна запись + опциональный побочный эффект),
с типом, зафиксированным самим действием (`mute`→MUTE, `warn`→WARN,
`kick`→KICK, `ban`→TEMPBAN/PERMBAN в зависимости от `durationHours`).
Только `ban` и `kick` имеют немедленный системный эффект: `kick` —
`AuthService.revokeAllSessions()` (разрыв текущих refresh-сессий,
доступ по уже выданному access-token сохраняется до истечения, это не
баг — см. ADR ниже); `ban` — дополнительно `User.isBanned`/`banReason`/
`bannedUntil`, что даёт мгновенный эффект на каждый запрос через
`JwtStrategy.validate()` (PHASE 05). `mute` — только дисциплинарная
запись; глобального mute-гейта вне ChatMute (PHASE 11, канальный)
требованиями не описано, поэтому не добавлен.

## ADR-0031 — `messages.hard_delete`/`comments.hard_delete` — только ChatMessage/ProfileComment

**Context.** В проекте несколько «типов сообщений» (ChatMessage,
DirectMessage) и несколько «типов комментариев» (ProfileComment,
NewsComment), но `QuickModerationController` даёt ровно один
cross-cutting `hard-delete` эндпоинт на каждую категорию.

**Decision.** `hard-delete message` применяется только к `ChatMessage`
(публичная поверхность, уже поддерживает soft-delete с `isDeleted` —
hard-delete добавляет более жёсткий инструмент для действительно
недопустимого контента). `DirectMessage` (личная переписка) намеренно
исключена — cross-cutting модераторский доступ к приватным сообщениям
не описан требованиями и является спорным продуктовым решением без
явного запроса. `hard-delete comment` применяется только к
`ProfileComment` (PHASE 09) — `NewsComment` уже имеет собственный путь
модерации (`DELETE /moderation/news/comments/:commentId`, `news.
comments.delete`, PHASE 13). Hard-delete комментария каскадно удаляет
его ответы (`ProfileComment.parent` — `onDelete: Cascade` в schema) —
осознанное поведение, не баг.

## ADR-0032 — Report-ban (тикет-система) — отдельный от account-бана механизм

**Context.** `ReportBan` ограничивает подачу обращений/сообщений в
тикет-системе конкретным пользователем (антиспам для системы жалоб),
тогда как `User.isBanned` — полная блокировка аккаунта (PHASE 05).
Смешивать их нельзя: репорт-бан — это санкция за злоупотребление именно
тикет-системой (спам обращениями), а не наказание в целом.

**Decision.** `ReportsService.requireNotBanned()` проверяет активный
`ReportBan` (`isActive: true` и `bannedUntil` в будущем или `null` —
бессрочный) перед `createReport()`/`createDonationProblem()`. Повторный
`POST /admin/reports/ban/:userId` деактивирует предыдущий активный бан
перед созданием нового (не копит дублирующие активные записи).
`reportNumber` генерируется в формате `R-YYYYMMDD-XXXXXX` (6 hex-символов
из `randomBytes(3)`), с retry-циклом на случай коллизии (аналогично
генерации уникального slug в Forms/PHASE 15).

## ADR-0033 — GameReport/GamePunishment и экспорт/upload-вложения не входят в PHASE 16

**Context.** Старый API-REFERENCE описывает `/game-reports`,
`/users/:username/game-reports/incoming|outgoing`, `/bans`
(`listActiveGamePunishments`), `/users/:username/punishments-history` —
все они оперируют `GameReportSummary`/`GamePunishmentSummary`, то есть
данными, которые в старом проекте приходили STUB-интеграцией с
внешними игровыми плагинами (TigerReports/LiteBans). Эта интеграция уже
зафиксирована как NOT_APPLICABLE в COVERAGE.md (раздел «Сознательно не
переносится») — в схеме нет моделей `GameReport`/`GamePunishment`.

**Decision.** Эти эндпоинты не реализуются — не урезание scope, а
продолжение уже принятого в PHASE 00 решения. Их аналог на основе
реальных данных — `UserPunishment` (`/users/me/punishments`, `/admin/
users/:username/punishments`) — полностью реализован. Аналогично не
реализованы `POST /admin/reports/export` (экспорт ответов в файл) и
upload вложений к обращениям/сообщениям (`/reports/:reportNumber/
attachments`, `.../messages/:messageId/attachments`) — зависят от
`StorageService` (PHASE 23, RISKS.md R3), тот же паттерн, что и в Forms
(ADR не требуется — уже задокументировано в RISKS.md R3).

## ADR-0034 — Store: платёжный вебхук — секрет в теле (как Voting), не HMAC-заголовок

**Context.** ADR-0009 требует: заказ переходит в `COMPLETED` только через
вебхук с проверенной подписью, без client-triggered «complete»-эндпоинта.
Нужен конкретный механизм проверки для `POST /webhooks/payments/:provider`.
Два варианта: (а) HMAC-подпись в заголовке над сырым телом запроса —
технически надёжнее, но требует raw-body capture middleware (Express
по умолчанию отдаёт уже распарсенный JSON, сырые байты теряются без
отдельной настройки `bodyParser.json({verify})`); (б) shared-secret
прямо в теле JSON, сравниваемый constant-time — тот же подход, что уже
применён для Voting webhook (ADR-0025), только там секрет хранится как
bcrypt-хеш (нужен для регенерации per-site), а здесь секрет один,
глобальный, из `PAYMENT_WEBHOOK_SECRET` — хранить его как хеш незачем,
сравнение `crypto.timingSafeEqual` достаточно.

**Decision.** Выбран вариант (б) — не требует правки Express body-parser
конфигурации, сразу тестируем через supertest без эмуляции сырых байт, и
согласован с уже принятым в проекте паттерном для вебхуков. Всегда
отвечает `200 {accepted, reason?}` (см. тот же мотив, что в ADR-0025 —
внешние провайдеры агрессивно ретраят non-2xx). Обработка идемпотентна:
повторный вебхук для заказа не в `PENDING` возвращает `{accepted: true,
reason: 'already_processed'}`, не меняя состояние повторно.

## ADR-0035 — Store: калькулятор обмена валют — без баланса/списания

**Context.** Старый API (`GameCurrencyController.getGameRates()`/
`exchange()`) наводит на мысль о "обмене" на баланс премиум-валюты
(RUBIES ↔ COINS). В реальности в схеме нет поля баланса ни на `User`,
ни на `PlayerStatistics` (там только `coins`, и оно явно помечено как
пушится игровым сервером, не записывается сайтом). `CurrencyRate` же по
форме (symbol, flag) — это курсы отображения цен в разных обозначениях,
а не баланс кошелька.

**Decision.** `POST /store/exchange` реализован как чистый калькулятор:
конвертирует сумму между двумя `CurrencyRate` по их курсам (общая база),
ничего не списывает и не начисляет — ни на сайте, ни на игровом сервере
(RCON/game commands — PHASE 18, ещё не реализовано). Это не урезание
функциональности, а единственная интерпретация, совместимая с реальной
схемой данных; если в будущем появится реальный баланс премиум-валюты,
`exchange()` потребует отдельного ADR на списание/начисление.

## ADR-0036 — Store: стратегия скидок — bulk (лучшая по строке) → loyalty → promo, последовательно от остатка

**Context.** Три независимых механизма скидок (`BulkDiscount` по товару/
типу+количеству/сумме, `LoyaltyDiscount` по числу прошлых завершённых
заказов, `PromoCode` вручную) потенциально комбинируются в одном заказе;
порядок и база начисления (от исходной суммы или от остатка после
предыдущей скидки) не описаны требованиями явно.

**Decision.** Применяются последовательно, каждая — от остатка после
предыдущей (не от исходного subtotal): bulk-скидка на каждую строку
корзины отдельно (если подходит несколько `BulkDiscount` — берётся
та, что даёт наибольшую скидку в деньгах, а не складываются все) →
loyalty-скидка (процент от суммы после bulk) → promo-код (процент/
фиксированная от суммы после loyalty). Это стандартная для e-commerce
последовательная модель (а не параллельная сумма процентов от
исходной базы), выбрана как наиболее предсказуемая и не допускающая
скидку больше 100% за счёт сложения процентов. `PricingService`
(`modules/store/pricing.service.ts`) — единая точка пересчёта,
используется и `CartService.calculate()`, и `OrdersService.
createFromCart()/quickBuy()` (ADR-0009: итог всегда пересчитывается
сервером, не доверяется клиенту).

## ADR-0037 — Store: `isUnique` проверяется при оформлении заказа, не при добавлении в корзину

**Context.** `Product.isUnique` означает «не более одной покупки за всё
время» (например, лицензия/уникальное звание). Проверка возможна в двух
точках: при добавлении в корзину или при создании заказа.

**Decision.** Проверка — только при создании заказа
(`OrdersService.assertNotAlreadyOwned`), против `OrderItem` в
`COMPLETED`-заказах пользователя. Добавление в корзину уникального
товара, который уже куплен, не блокируется намеренно — пользователь
может держать его в корзине (например, по ошибке положил), ошибка
покажется только при реальной попытке оплатить, что честнее передаёт
причину отказа (у UI есть что показать — «уже куплено», а не просто не
даёт добавить в корзину без объяснения на этом шаге).

## ADR-0038 — Store: `quick-buy` всегда анонимен, доставка — только через `guestMinecraftNick`

**Context.** API-REFERENCE явно помечает `POST /store/quick-buy` как
"NONE (no guard)" — не как "optional" (в отличие от `GET /store/
products/:slug`, помеченного именно "optional; guards:
OptionalJwtAuthGuard"). Это разные формулировки в одном документе,
не случайность.

**Decision.** `quick-buy` не проверяет и не использует `Authorization`
заголовок вообще, даже если он есть и валиден — всегда создаёт
анонимный заказ (`userId: null`, обязательный `guestMinecraftNick`).
Авторизованная быстрая покупка одного товара без явного запроса такого
поведения не описана требованиями; авторизованный пользователь,
желающий купить один товар, использует `POST /store/cart/items` +
`POST /store/orders` (2 запроса вместо 1) — это осознанный компромисс,
а не недосмотр.

## ADR-0039 — Store: доставка (game commands) не входит в PHASE 17

**Context.** `OrderItem.isDelivered`/`deliveredAt` существуют в схеме,
`Product.gameCommands` хранит команды для выдачи привилегии/предмета на
игровом сервере. Реальная доставка требует RCON/API-интеграции с
Minecraft-сервером — PHASE 18, ещё не реализована.

**Decision.** Вебхук подтверждения оплаты (`OrdersService.
handleWebhook`) переводит заказ в `COMPLETED`, но не трогает
`isDelivered` — он остаётся `false` до PHASE 18. Это не баг и не
забытая функциональность: честно отражает реальное состояние (команды
никуда не отправлены), а не создаёт иллюзию выполненной доставки.
`PaymentProviderRegistry` аналогично не регистрирует `TestPaymentProvider`
в production (`NODE_ENV=production`) — до появления реального провайдера
(RISKS.md R2) `createFromCart()`/`quickBuy()` в production возвращают
503 с понятной причиной вместо тихого заглушечного успеха.

## ADR-0040 — Minecraft servers: реальный Server List Ping вместо моков/внешнего API

**Context.** `GET /servers/:slug/status|players|history`, `/servers/
overview`, `/servers/widget` должны отражать реальное состояние игрового
сервера (онлайн/офлайн, число игроков, версия, MOTD). В отличие от
Twitch/YouTube (PHASE 14, RISKS.md R6) или платёжного провайдера (PHASE
17, RISKS.md R2), для этого не нужен внешний API-ключ: Minecraft Server
List Ping (SLP, см. wiki.vg/Server_List_Ping) — открытый, неаутентифицированный
бинарный протокол поверх TCP, тот же, что использует ванильный клиент
Minecraft для показа сервера в списке серверов. Нужны только `address`/
`port` сервера, которые уже есть в модели `Server`.

**Decision.** Протокол реализован вручную (`modules/minecraft/slp/`:
`varint.ts` — кодирование/декодирование VarInt, `slp-client.ts` —
handshake → status request → разбор JSON-ответа → ping/pong для задержки)
— без внешней npm-зависимости (протокол простой, пакет добавлял бы риск
без реальной экономии кода) и без моковых данных. Недоступность сервера
(таймаут/connection refused/невалидный ответ) — не ошибка, а валидный
результат `{online: false}`; `MinecraftStatusService` не выбрасывает
исключение. e2e-тесты проверяют клиент против собственного
протокол-корректного TCP-сервера в тесте (не против импорта той же
кодирующей функции — VarInt-кодирование продублировано в тесте, чтобы
тест реально валидировал wire-формат, а не "соглашался сам с собой"), и
против реально закрытого порта для случая `offline`.

## ADR-0041 — Minecraft servers: нет фоновой периодичности и RCON — честно, не заглушка

**Context.** Старый `GameServer`-REST подразумевает частый live-опрос;
реальный продакшен обычно кеширует статус и опрашивает по расписанию
(cron), а `Product.gameCommands` (Store, ADR-0039) требует RCON —
отдельный протокол с паролем для выполнения команд на сервере.

**Decision.** Статус опрашивается **на каждый запрос** (`GET /servers/
:slug/status`, `/overview`, `/widget`) и дополнительно пишется в
`ServerStatusLog` для истории — без фонового job/кеша, поскольку
cron-инфраструктуры в проекте ещё нет (PHASE 29); это осознанно иначе,
чем "честно недоступно" — функция полностью рабочая, просто не
оптимизирована (лишние запросы = лишние TCP-соединения, не проблема
корректности). RCON **не реализован и не будет** в рамках этого
проекта в его текущем виде схемы: модель `Server` не имеет поля для
RCON-пароля — добавление RCON потребовало бы миграции схемы и отдельного
ADR о хранении секрета (аналогично `VoteSite.webhookSecretHash`,
ADR-0025), что не было запрошено требованиями. Это окончательно
закрывает вопрос доставки `gameCommands` (Store ADR-0039) — не "ещё не
реализовано", а "не предусмотрено текущей схемой данных".

## ADR-0042 — Minecraft servers: audit log не подключается ad-hoc

**Context.** Старый API-REFERENCE упоминает `audit.log()` рядом с каждым
admin CRUD-вызовом (`servers.create()`, `.update()`, `.remove()` и т.д.,
аналогично для категорий серверов). Модель `AuditLog` в схеме уже есть
(PHASE 04), но сервис для записи в неё — отдельная, сквозная для всего
проекта фаза (PHASE 22, ROADMAP.md), ещё не реализованная.

**Decision.** Admin-эндпоинты этой фазы не пишут в `AuditLog` напрямую —
согласовано с тем, что ни один из уже реализованных admin-модулей
(Forms/Reports/Store и т.д.) этого тоже не делает: добавлять его точечно
только здесь было бы несогласованным заделом, который PHASE 22 всё равно
придётся переписывать под единый сквозной механизм (вероятно, через
interceptor/decorator, а не ручные вызовы в каждом сервисе).

## ADR-0043 — Achievements: прогресс считается батчем (check-all-users), не событийно

**Context.** `AchievementConditionType` содержит 19 значений, многие из
которых завязаны на метрики из ДРУГИХ модулей (друзья, комментарии,
покупки, подарки, жалобы). Два архитектурных варианта пересчёта
прогресса: (а) событийный — встраивать вызов проверки в каждый сервис,
где метрика меняется (friends.service после принятия заявки,
orders.service после завершения заказа и т.д.) — требует правок в
десятке уже реализованных модулей; (б) пакетный (pull) — одна функция
перебирает все активные достижения для пользователя(ей) и пересчитывает
метрики из текущего состояния БД. Сам API уже содержит
`POST /admin/achievements/check-all-users` — явный признак того, что
исходный дизайн предполагает именно пакетную модель, а не событийную.

**Decision.** Выбран вариант (б): `AchievementProgressService.checkUser()`/
`checkAllUsers()` — единая точка пересчёта, не требующая правок в других
модулях. Вызывается только явно (admin-эндпоинт); периодический
автозапуск (например, раз в час через cron) — PHASE 29, когда появится
background-job инфраструктура. До этого новые достижения не
разблокируются "сами" в реальном времени — только по явному запуску
check-all-users или при следующем визите пользователя на страницу
достижений (если бы getAllAchievements тоже вызывал checkUser — не
делает этого сейчас, чтобы GET-запрос оставался быстрым и без побочных
эффектов; honest tradeoff, не баг).

## ADR-0044 — Achievements: DAYS_STREAK/PROFILE_VIEWS не считаются — нет персистентного счётчика

**Context.** `DAYS_STREAK` (серия дней подряд с входом) и `PROFILE_VIEWS`
(число просмотров профиля) требуют персистентного счётчика, который
обновляется при каждом входе/просмотре. В схеме такого поля нет ни на
`User`, ни где-либо ещё (есть только `lastLoginAt`/`lastActivityAt` —
одна точка времени, из которой нельзя вывести "серию подряд идущих
дней" без истории; просмотры профиля нигде не считаются).

**Decision.** `AchievementProgressService.computeMetric()` возвращает
`null` для этих двух типов условий — прогресс по ним не продвигается
автоматически (достижения с такими условиями можно выдать только
вручную через `grantAchievement()`). Это не баг и не заглушка: добавление
реальных счётчиков потребовало бы миграции схемы (новые поля/таблица
истории посещений) и решения, кто и когда их обновляет — вне scope этой
фазы без отдельного запроса.

## ADR-0045 — Achievements: rewardRubies не зачисляется — нет кошелька премиум-валюты

**Context.** Как и `POST /store/exchange` (PHASE 17, ADR-0035),
`Achievement.rewardRubies` описывает намерение (сколько рубинов дать за
достижение), но в схеме нет поля баланса премиум-валюты ни на `User`,
ни на `PlayerStatistics` (там только `coins`, которые пушит игровой
сервер, а не начисляет сайт).

**Decision.** `rewardRubies` хранится на `Achievement` и возвращается в
ответах API как заявленная награда (фронт может показать "+100 рубинов"
в уведомлении), но физически никуда не зачисляется — честно, по
аналогии с ADR-0035, а не изобретённый на скорую руку счётчик.
`rewardBadgeType` — РЕАЛЬНО выдаётся (создаёт/активирует `UserBadge`,
модель для этого уже есть); `rewardTitle`/`rewardMessage` — только
отображаемый текст, персистентной «экипированной» должности пользователя
в схеме тоже нет.

## ADR-0046 — Leaderboards: рейтинги только по реальным данным, без выдуманных метрик

**Context.** `GET /leaderboards` — единственный эндпоинт без query-
параметров в исходном API; что именно ранжировать, явно не описано.

**Decision.** Реализовано 5 реальных рейтингов, вычисляемых прямой
агрегацией по уже существующим таблицам: playtime/kills/coins (из
`PlayerStatistics`, пушится игровым сервером), achievements (количество
завершённых `UserAchievement` на пользователя), purchases (количество
`COMPLETED` заказов на пользователя). Никаких дополнительных полей/
таблиц не добавлено — это не "временная заглушка до полноценного
рейтинга", а полный, работающий набор на основе того, что реально
трекается на сегодняшний день в проекте.

## ADR-0047 — Admin backend: полное ретроактивное покрытие audit log — PHASE 22, не PHASE 20

**Context.** `docs/technical/25-AUDIT-LOG.md` фиксирует: из 186 staff-
мутаций старого проекта только 21 вызов писал в audit log, и отдельно
перечисляет "обязательные новые действия" (`role.*`, `order.refund`,
`store.*`, `server.*`, `moderation.*` и т.д.) — это охватывает ВСЕ уже
реализованные домены PHASE 05–19. Ретроактивно добавлять `audit.log()`
вызовы во все эти модули прямо в PHASE 20 означало бы правки в десятке
уже смёрженных PR вне заявленного scope фазы (admin backend), по тому
же принципу, что и ADR-0027 (retroactive-улучшения — только точечно,
не бесконтрольно).

**Decision.** В PHASE 20 реализован сам `AuditService` (`log/list/
getStats/cleanupOld`) и read-эндпоинты (`/admin/audit-log*`), плюс
логирование добавлено ТОЛЬКО для действий, появляющихся в этой фазе:
`settings.update`, `settings.site.update`, `security.ip_whitelist.update`,
`notification.broadcast`, `user.ban`/`user.unban` (bulk). Полное
ретроактивное покрытие остальных 15+ доменов — явно отдельная PHASE 22
("Audit log — обязательные события, retention"), как и зафиксировано в
ROADMAP.md с момента PHASE 00.

## ADR-0048 — Admin backend: scheduled exports — только CRUD-хранение, выполнение по расписанию — PHASE 29

**Context.** `ScheduledExport.schedule` — cron-подобная строка,
`nextRunAt`/`lastRunAt` — поля под фактическое выполнение. В проекте
по-прежнему нет cron/очереди (см. ADR-0043, ADR-0042) — background jobs
заявлены отдельной PHASE 29.

**Decision.** `AdminToolsService` реализует только CRUD над
`ScheduledExport` (per-admin, персональные записи). `nextRunAt`/
`lastRunAt` не вычисляются и не проставляются при создании — честно
оставлены `null` до появления реального планировщика в PHASE 29, вместо
того чтобы городить одноразовый cron-парсер ради поля, которое пока
никто не читает.

## ADR-0049 — Admin backend: `security/suspicious` и `security/logins` — честные прокси, без новых моделей

**Context.** `GET /admin/security/suspicious` в старом API не имеет
backing-модели `SuspiciousActivity` — только Redis-счётчики
`BruteForceService` (PHASE 05: `bruteforce:login:*`/`bruteforce:blocked:*`
по IP, TTL 900s). `GET /admin/security/logins` тоже не имеет отдельной
модели истории входов — только `RefreshToken`, создаваемый при каждом
успешном `/auth/login`.

**Decision.** `listSuspiciousActivity()` читает реальное состояние Redis
через `SCAN` (не блокирующий `KEYS`) по обоим паттернам ключей и
возвращает `{ip, failedAttempts, isBlocked, blockedTtlSeconds}` —
честные данные о текущем рантайм-состоянии brute-force защиты, не
персистентная история (сбрасывается вместе с TTL). `listLoginHistory()`
использует `RefreshToken.createdAt` как прокси момента входа — каждый
новый токен создаётся именно при успешном логине (`AuthService.login`),
это не фиктивные данные, но и не отдельный полноценный лог входов
(переиспользованные/протухшие токены не отличить от "вход, из которого
не разлогинились" без отдельной модели — за рамками этой фазы).

## ADR-0050 — Admin backend: `requireAdmin2fa` — поле без механизма; `users/bulk` проверяет priority-иерархию

**Context 1.** `SiteSettings.requireAdmin2fa` — поле из исходной схемы
БД (PHASE 04), но ни одной TOTP/OTP-модели в схеме нет и 2FA нигде не
реализован (ни при login, ни где-либо ещё).

**Decision 1.** Поле сохраняется и редактируется через
`UpdateSiteSettingsDto` как есть (переключатель персистентен), но
ничего в коде его не читает/не обеспечивает — честно задокументировано,
а не тихо проигнорировано. Реализация 2FA — отдельный незаявленный
scope (нет в ROADMAP ни одной фазой), будет оценена отдельно при явном
запросе.

**Context 2.** `PATCH /admin/users/bulk` — первое место в проекте, где
массовое действие над пользователями (бан/разбан) инициируется другим
пользователем; `QuickModerationService.ban()`/`kick()`/`mute()`/`warn()`
(PHASE 16) priority-иерархию не проверяют вообще (только
`RolesGuard`/`RoleGroup`-уровень на контроллере).

**Decision 2.** `AdminUsersBulkService` вызывает
`PermissionService.canActOn(actorId, targetId)` (уже существующий метод,
ранее использовавшийся только для role assign/revoke, см.
`UserRolesController`) перед каждым BAN/UNBAN в batch — по одному target
за раз, с отдельной audit-записью на каждого (см. ADR-0047 и
docs/technical/25-AUDIT-LOG.md: "Массовый бан — проверить, что
логируется на каждого"). Один отклонённый/упавший target возвращается в
`failed[]`, не валит весь batch — тот же принцип устойчивости, что и
`AchievementProgressService.checkAllUsers` (PHASE 19). Ретроактивное
добавление той же проверки в PHASE 16 single-user эндпоинты — вне scope
этой фазы (зафиксировано как техдолг, не баг).

## ADR-0051 — API-контракт frontend ↔ backend живёт в `packages/shared`, реестр permissions — там же

**Context.** PHASE 21 — первая фаза с реальным frontend. MASTER PROMPT §9:
frontend не должен зависеть от внутренних классов NestJS, общение — через
нормальный API-контракт, потому что позже backend планируется вынести в
отдельный репозиторий `twomcsu-api`. В `apps/api` DTO описаны классами
class-validator (runtime-декораторы, зависимость от `@prisma/client` для
enum-ов) — импортировать их во frontend нельзя. Swagger/OpenAPI в backend
нет (типизированный генерируемый клиент — PHASE 30 по ROADMAP).

**Decision.** `packages/shared/src/api/*` — ручные TypeScript-интерфейсы
ответов и запросов (`MeResponse`, `Paginated<T>`, `AdminUserFull`,
`RoleWithPermissions`, `AuditLogEntry`, `SiteSettingsDto`…), зеркалящие
фактическое поведение контроллеров PHASE 05–20: даты как ISO-строки,
Prisma `Decimal` как строки. Пакет содержит только типы и чистые
константы (enum-литералы `as const`), без зависимостей от NestJS/Prisma/
Next. Backend на них **не** завязан (его DTO остаются источником истины
валидации) — контракт проверяется e2e-тестами backend + unit-тестами
frontend; при расхождении правится контракт. Генерация из OpenAPI
(PHASE 30) заменит ручные типы, не меняя импортов frontend.

Реестр permission keys (`PERMISSIONS`, `PermissionKey`) перенесён из
`apps/api/prisma/seed/permissions.ts` в `packages/shared/src/permissions.ts`:
seed импортирует его из `@twomc/shared` (единственный runtime-импорт
shared в api, выполняется через ts-node, в `nest build` не попадает —
`prisma/` исключён из `tsconfig.build.json`, что заодно починило layout
`dist/` для `start:prod`), а frontend получает строковый литерал всех
ключей — опечатка в навигации/гейтах ловится на typecheck.
`@RequirePermissions(...)` на backend остаётся единственной точкой
авторизации; frontend-проверки — только UX.

**Consequences.** Любое изменение формы ответа backend требует правки
контракта (ловится e2e/типами). Добавление permission-ключа — только через
`packages/shared` (один файл для обеих сторон).

## ADR-0052 — Сессия во frontend: access-token в памяти, single-flight refresh, `GET /auth/me` как источник permissions

**Context.** Backend (PHASE 05): access-token 15 мин в теле ответа,
refresh-token в httpOnly-cookie с ротацией и reuse detection — повторное
использование отозванного cookie отзывает ВСЕ сессии пользователя.
Frontend-меню должно строиться из effective permissions
(44-TARGET-ARCHITECTURE.md §2), но `GET /auth/me` их не отдавал.

**Decision.**
1. `GET /auth/me` расширен полями `roles[]` и `permissions`
   (`EffectivePermissions` из `PermissionService` — тот же Redis-кеш с
   немедленной инвалидацией, что и у `PermissionsGuard`; `maxPriority`
   отдаётся как `null` при отсутствии ролей вместо несериализуемого
   `-Infinity`). Отдельный endpoint не вводился: один запрос при загрузке
   приложения вместо двух.
2. Access-token хранится только в памяти (`lib/api/token-store.ts`), не в
   localStorage/cookie. Восстановление сессии при загрузке — `POST
   /auth/refresh` по cookie, затем `/auth/me`.
3. `refreshAccessToken()` и `bootstrap()` — single-flight (один промис на
   модуль): параллельные 401 и двойной вызов эффектов в React StrictMode
   не порождают два refresh с одним cookie (иначе reuse detection отозвал
   бы все сессии). Покрыто unit-тестами.
4. 401 на любом запросе → один refresh → повтор; при неудаче — локальная
   очистка сессии (`status: anonymous`) без принудительного редиректа из
   HTTP-слоя: редирект на `/login` делает guard маршрута, где известен
   `next`-путь.
5. hCaptcha-виджет во frontend не подключён (RISKS.md R5, ключей нет):
   ответ `{ requiresCaptcha: true }` показывается как явная ошибка входа,
   а не как «неверный пароль».

**Consequences.** Нет cookie-гейта в Next.js middleware (как было в старом
проекте): refresh-cookie выставляется API-доменом и в production может быть
недоступна web-домену — защита маршрутов выполняется на клиенте после
восстановления сессии, настоящая защита остаётся на backend.

## ADR-0053 — Дизайн-система: семантические токены, TwoMC UI-слой поверх Radix, три направления в `/design-lab`

**Context.** Владелец (2026-10-08) обнулил все прошлые визуальные указания:
дизайн создаётся с нуля, единственное ограничение — фирменный оранжевый.
Требуется узнаваемый продуктовый дизайн без AI/SaaS/shadcn-шаблонности,
три заметно разных направления для честного сравнения, затем решение
владельца и только потом перенос на страницы.

**Decision.**
1. **Токены** (`apps/web/src/styles/tokens.css`) — только семантические
   (`surface/primary/border/ring/success…`, радиусы, тени, шрифты,
   плотность, движение), RGB-каналами для alpha; Tailwind маппится на
   токены. Направление и тема — атрибуты `data-direction`/`data-theme`
   на корне; компоненты не знают hex и не знают, в каком направлении
   рендерятся. Порталы overlay получают токены через зеркалирование
   атрибутов на `<html>`.
2. **UI-слой** `apps/web/src/components/ui/*` — единственная точка импорта
   для feature-кода. База: `radix-ui` (единый пакет), `vaul` (drawer),
   `sonner` (toast), `cmdk` (command palette), `lucide-react` (одна
   icon-библиотека), `cva`/`clsx`/`tailwind-merge`. Контракт слоя —
   `components/ui/README.md`. Tooltip / Toggletip / Popover / DropdownMenu
   / ContextMenu / HoverCard — разные компоненты; Dialog и AlertDialog не
   смешиваются; mobile-замены overlay (BottomSheet/ActionSheet) — в слое.
3. **Три направления** (`app/design-lab/directions.ts`): «Раскалённое»
   (Unbounded/Golos, тёплый уголь, табло онлайна), «Полдень» (Onest +
   Literata, бумага на сером, стопка аватаров), «Пульт» (Commissioner/
   Martian Mono, графит, статусная таблица + ⌘K). Различаются
   типографикой, плотностью, композицией, поверхностями, формой,
   движением — не оттенком. Шрифты — `next/font/google` с Cyrillic,
   только в layout лаборатории.
4. **`/design-lab`** — внутренний маршрут (в production — 404 без
   `NEXT_PUBLIC_DESIGN_LAB=1`), `robots: noindex`: карточка направления,
   витрина (публичная + админ-сцена на одном наборе элементов),
   Interactions / Component lab, Role prefixes. Выбор направления — за
   владельцем; до решения выбранный стиль на страницы не переносится
   (critique и рекомендация — `docs/design/DESIGN-CRITIQUE.md`).

**Consequences.** Admin-экраны PHASE 21 (часть 2) строятся на этом же
UI-слое после выбора направления — смена направления = правка токенов,
а не страниц. В production остаётся одна пара шрифтов; `fonts.ts`
лаборатории не попадает в остальные маршруты.

## ADR-0054 — Графические префиксы ролей: реестр по `Role.slug` в shared, CDN через конфиг, только визуализация

**Context.** У 29 staff-ролей есть официальные PNG-префиксы из Minecraft
resource pack на `cdn-files.twomc.su` (pixel-art 7 px высотой, ширина
35–117 px). Нужно показывать их рядом с никами без хардкода по компонентам
и без связи с permissions.

**Decision.** Реестр `packages/shared/src/role-prefixes.ts` — slug роли →
имя и реальная ширина PNG (измерены 2026-10-08; все 29 URL проверены:
200, image/png). Ключ — `Role.slug` (как в seed superuser-ролей), не
displayName. CDN-хост — только `NEXT_PUBLIC_CDN_BASE_URL` (`lib/env.ts`,
`cdnUrl()`); физический путь сервера во frontend не используется, клиент
не может подставить произвольный URL. Компонент `RolePrefix` — обычный
`<img>` (не `next/image`: pixel-art нельзя ресемплить) с явными
width/height, `image-rendering: pixelated`, целочисленным масштабом
xs/sm/md/lg (2×/3×/4×/6×), `loading=lazy`, Tooltip TwoMC, fallback на
текстовый бейдж при 404/неизвестной роли. Основная роль пользователя —
`pickPrimaryRole`: старшая по `priority` роль с префиксом (иерархию задаёт
backend, frontend только выбирает, что показать). Permissions — только
RBAC backend; префикс ничего не решает. В seed PHASE 32 staff-роли должны
получить slug из этого реестра.

**Consequences.** Добавление/переименование префикса — одна запись в
shared; UI не меняется. Upload/редактирование префиксов не предусмотрено —
assets фиксированы.

## ADR-0055 — «Полдень» dark-first как единственная дизайн-система; стеклянные материалы запрещены

**Статус:** принято (решение владельца 2026-10-08, дополнено 2026-10-09).

**Контекст.** Из трёх кандидатов `/design-lab` владелец выбрал «Полдень»
с требованием сделать тёмную тему основной (не инверсией светлой, а
отдельно подобранной палитрой), светлую — вторичной. Позже была
проработана система Frosted/Liquid Glass для overlay; владелец отменил её
полностью и окончательно.

**Решение.**
- `tokens.css`: `:root`/`[data-theme='light']` — светлый «Полдень»,
  `[data-theme='dark']` — тёмный (default на `<html>`, inline no-flash
  скрипт, выбор в `localStorage` `twomc.theme.v1`, `ThemeToggle`
  Тёмная/Светлая/Как в системе).
- Альтернативные направления (`ember`, `signal`), их токены, шрифты и
  витрины удалены; атрибут `data-direction` больше не используется.
- Шрифты self-hosted (`@fontsource-variable/*`), запросов к Google Fonts
  нет (сборка в CI без сети, RU data residency).
- Overlay-компоненты — solid `surface-overlay` + `border` + `shadow-lg` +
  `edge-highlight`; backdrop модалок — затемнение без blur. Никаких
  `backdrop-filter`, полупрозрачных glass-поверхностей, SVG-преломления.

**Последствия.** Одна система, две темы; визуальная глубина достигается
иерархией поверхностей (`background → surface → surface-raised →
surface-overlay`), границами и тенями. Любое предложение «стекла»
отклоняется без обсуждения.

## ADR-0056 — Audit log через глобальный interceptor по `@RequirePermissions`

**Статус:** принято (PHASE 22).

**Контекст.** 186 staff-мутаций в 20+ доменах, из них вручную логировались
~20. Добавлять `audit.log()` в каждый сервис — долго, легко пропустить и
дорого поддерживать.

**Решение.** `AuditInterceptor` (`APP_INTERCEPTOR`, `modules/audit`)
логирует любую успешную мутирующую HTTP-операцию на хендлере с
`@RequirePermissions`: действие = ключ permission, цель — из параметров
маршрута или `id` результата, изменения — очищенное тело запроса, IP/UA/
длительность; уровень — по правилам из ключа. Хендлеры с собственным,
более богатым логированием помечаются `@SkipAudit()`. Ретенция —
`AUDIT_RETENTION_DAYS`, очистка ежедневно таймером процесса.

**Последствия.** Новый admin-эндпоинт попадает в audit автоматически, как
только получает `@RequirePermissions`. Запись идёт после ответа (не в одной
транзакции с мутацией) — компромисс, задокументирован в PHASE-22.

## ADR-0057 — Хеш пароля исключён из результатов Prisma глобально

**Context.** 44 места в API возвращают `include: { author | user | createdBy: true }`
(новости, события, DM, чат, комментарии…) — полный `User` вместе с `password`
попадал в публичные ответы. Точечные `select` в каждом месте хрупки.

**Decision.** `PrismaService` создаётся с `omit: { user: { password: true } }`
(Prisma 6 `omit` API). Там, где hash действительно нужен (`AuthService.login`,
`changePassword`), поле запрашивается явно `omit: { password: false }`. Любой
новый `include` безопасен по умолчанию; e2e (`auth`, `users-domain`) проверяют
отсутствие `password` в ответах.

## ADR-0058 — Оболочка v2: плавающие header/footer, edge-peek действия, независимые язык/валюта

**Decision.** Header и footer публичных страниц — отдельные solid-поверхности
внутри области контента (отступы от краёв, `rounded-xl`, граница/тень, никакого
backdrop-filter — ADR-0055), rail остаётся fixed. Глобальные действия (чат,
корзина) на desktop — «язычки» у правой границы, выезжающие по hover/focus/open
(без bounce); на mobile — dock над нижней навигацией. Язык и валюта — две
независимые настройки в одном popover (`lib/site/preferences.ts`); варианты без
поддержки сервера показываются как «скоро» и не выбираются. Z-index:
`dropdown/popover (55) > modal (50)`, чтобы popover-контролы (ColorPicker)
работали внутри диалогов. Бренд в UI — «twomc.su», строка «New-Era Anarchy» не
используется; информационное примечание о Mojang AB — в футере со ссылкой на
документ политики.

## ADR-0059 — Cloudflare Turnstile вместо hCaptcha

**Decision.** Единая anti-bot система — Cloudflare Turnstile. Backend
`CaptchaService.verify(token, remoteIp)` обращается к Siteverify с
`TURNSTILE_SECRET_KEY`; токен с frontend без этой проверки ничего не значит.
Обязателен для login (каждая попытка, ответ `403 { requiresCaptcha: true }`),
register, forgot-password, reset-password; дальше — для публичных форм обращений/
жалоб по мере их появления. Frontend `<Turnstile />` рендерит виджет явно и
сбрасывает его после каждой попытки. Dev использует официальные тестовые ключи
Cloudflare (не отключение проверки), `TURNSTILE_DISABLED=true` — только CI e2e без
сети. hCaptcha (`HCAPTCHA_*`) удалена.

## ADR-0060 — Подтверждение переходов на сторонние сайты

**Decision.** Глобальный `ExternalLinkGuard` (capture-слушатель кликов по `<a>`)
и `lib/site/external-links.ts` с единственным allowlist доверенных доменов
(`twomc.su` и поддомены, localhost). Для внешних ссылок — модалка с hostname и
компактным URL; переход — `window.open(url, '_blank', 'noopener,noreferrer')`.
mailto/tel/hash/внутренние ссылки не перехватываются; `javascript:`, `data:` и
битые URL не открываются. Отдельной логики для соцсетей нет.

## ADR-0061 — Логин = ник; точечные alias'ы входа

**Decision.** Для всех пользователей логин для входа — это `username` (он же
игровой Minecraft-ник) или e-mail; отдельного поля «login» в модели User нет и
регистрация его не спрашивает. Исключения — точечные alias'ы входа в отдельной
таблице `login_aliases` (`alias` в нижнем регистре → `userId`). Сейчас один:
bootstrap #2 — вход `younaxo` → аккаунт с ником `younaxo_` (`BOOTSTRAP_CHIEF_
CURATOR_LOGIN_ALIAS`). Ник отображается и используется в Minecraft без изменений.
Ник, совпадающий с alias, зарегистрировать нельзя (409); seed отказывается
создавать alias, совпадающий с чужим ником.

## ADR-0062 — Уровень доступа (accessLevel)

**Decision.** `User.accessLevel` (целое 0…100, default 0) — отдельный параметр,
не связанный с permissions (что можно делать) и priority ролей (над кем).
Авторизация действий остаётся на permissions; accessLevel не используется как
`if (level >= N)`. Отображается в title админки `twomc.su | A [N]` (из
`/auth/me`) и в карточке пользователя. Изменение — `PATCH /admin/users/:id/
access-level` с `users.access_level.edit`: системный аккаунт неизменяем; чужой —
только над пользователем ниже по иерархии и не выше собственного уровня; свой —
только с `users.access_level.edit_self`; запись в audit (`from → to`).

## ADR-0063 — Тема по умолчанию: как в системе

**Decision.** (Заменяет «dark по умолчанию» из ADR-0055.) Режим темы — System /
Dark / Light, default System (`prefers-color-scheme`, слушатель смены темы ОС).
Выбор хранится в localStorage (`twomc.theme.v1`); inline-скрипт в `<head>`
выставляет фактическую тему до первой отрисовки (SSR отдаёт `dark`, провайдер не
трогает атрибут до чтения настройки — без вспышки). Админка использует ту же
настройку. Dark — основная проработка, эталон — `/design-lab?d=daylight&theme=dark`.

## ADR-0064 — Единое поведение модальных окон

**Decision.** Dialog, AlertDialog, Sheet, Drawer: тёмный scrim (токен
`--scrim`, не foreground — в dark он светлый), крестик справа сверху, закрытие
по Escape и клику вне окна. Для AlertDialog любое закрытие = «Отмена» (действие
выполняется только кнопкой подтверждения; во время запроса ConfirmDialog
закрытие игнорирует); начальный фокус — «Отмена». Все плавающие слои — на шкале
z-index (popover/dropdown 55 > modal 50, tooltip 60), без рамок и blur.

## ADR-0065 — Бренд: постоянный логотип, wordmark и сезонная «o»

**Decision.** Три независимых уровня: (1) основной логотип
`cdn-files.twomc.su/assets/images/logo.png` — постоянный, сезоны его НЕ меняют
(у кампании нет поля логотипа; favicon/OG/админка/auth — всегда он);
(2) wordmark «twomc.su» — `<BrandWordmark/>`, текстовое имя всегда строка
`twomc.su` (sr-only, title, metadata); (3) буква «o» внутри wordmark —
базовая (контур Onest Bold, оранжевая) или своя у активной сезонной кампании
(`public/assets/brand/wordmark-o-<id>.svg`), при отсутствии/ошибке — базовая.
Сезонные кампании (реестр `lib/site/seasonal.ts`: Новый год, 14 и 23 февраля,
8 марта, День Победы, 1 сентября, Хэллоуин, Чёрная пятница; приоритет при
пересечении, одна кампания за раз) могут менять только «o», декор, эффекты и
баннеры. Система выключается целиком (`off`).
