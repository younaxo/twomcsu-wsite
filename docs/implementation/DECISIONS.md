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
Уточнение (ADR-0157): тестовый провайдер регистрируется только при `NODE_ENV` in {development, test}, подпись вебхука — HMAC-SHA256 над сырым телом.

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

**Status:** Superseded by ADR-0157.

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

## ADR-0066 — Глобальная плашка сайта

**Decision.** Синглтон `SiteAlert` (`site_alert`, id `global`): enabled, variant
(danger/warning/info/success — семантические токены), icon (ключ из разрешённого
набора `SITE_ALERT_ICONS`, не SVG-код — исключает SVG-инъекции), title, message,
ссылка (только `https://…` или внутренний `/…`) с подписью. Показывается в
`AppShell` сразу под шапкой всем посетителям, пока включена; пользователь закрыть
её не может (ни крестика, ни dismiss в storage). Публичная часть — поле `alert` в
`GET /site/settings` (null, если выключена). Управление — вкладка «Плашка» в
настройках с live-preview; `settings.alert.view` / `settings.alert.edit`; audit:
`settings.alert.enable` / `disable` / `update` с diff изменённых полей.

## ADR-0067 — Соцсети проекта списком

**Decision.** Фиксированные колонки `SiteSettings.discordInvite/vkGroup/
telegramChannel/youtubeChannel` заменены расширяемым списком `SiteSocialLink`
(platform из пресетов `SITE_SOCIAL_PLATFORMS` — Telegram, Discord, YouTube,
TikTok, VK, Twitch, Instagram, X, Facebook; title, url, isEnabled, sortOrder).
Миграция переносит сохранённые ссылки; старые колонки не удаляются. URL — только
https на домен выбранной платформы. Публично — `socialLinks` (только включённые,
по порядку) в `GET /site/settings`; футер, rail и «Сообщество» читают только его
(env — fallback для основных платформ). Из формы настроек убраны название,
описание, контактный e-mail, логотип и favicon (бренд фиксирован, ADR-0065).
apps/api не импортирует `@twomc/shared` даже типами (ESLint
`no-restricted-imports`): иначе tsc втягивает исходники пакета и `dist/main`
оказывается не на месте.

## ADR-0068 — Массовое изменение прав ролей

**Decision.** `POST /admin/roles/bulk/permissions` (`permissions.manage` +
`roles.bulk.edit`): режимы ADD/REMOVE по умолчанию; REPLACE (одинаковый набор
всем) — только с `confirmReplace: true` и отдельным подтверждением в UI. Роли с
полным доступом (`isSuperuser`), системные (без superuser у актора) и роли с
priority не ниже собственного блокируют ВСЮ операцию с перечнем причин (ничего не
пропускается молча). Выдавать можно только права, которые есть у самого актора.
Изменения применяются одной транзакцией. Audit: родительское событие
`roles.bulk.permissions` (режим, роли, списки) + по событию
`roles.permissions.update` на каждую изменённую роль (added/removed).

**Дополнение к ADR-0066 (2026-10-09).** Плашка — часть sticky-шапки
(HeaderStack): «язычок» из её нижней кромки, чуть уже, двигается вместе с ней.
Режим отображения `displayStyle` (outline — solid-поверхность шапки + обводка
цветом типа; filled — сплошная заливка) независим от типа. Фон всегда плотный.
Расписание `startsAt/endsAt` (UTC, показ по серверному времени). Свой SVG
(`icon = custom`) проверяется на сервере (`svgProblems`: скрипты, on*, внешние
ссылки, data:, foreignObject) и на сайте показывается только как `<img>`.
Управление перенесено в «Объявления → Верхняя плашка».

## ADR-0069 — Вход через Discord/Telegram только для привязанных аккаунтов

**Decision.** `UserExternalAccount` (provider + providerUserId уникальны; один
аккаунт провайдера на пользователя). Discord — OAuth2 code flow (scope
`identify`, redirect `https://api.twomc.su/auth/discord/callback`, dev —
`http://localhost:4000/...`): подписанный HMAC `state` (режим login/link, id
пользователя для link, `next` — только внутренний путь, срок 10 минут) +
nonce в httpOnly-cookie против CSRF. Telegram — Login Widget (popup
`Telegram.Login.auth`, домен бота `twomc.su`): backend проверяет подпись
(`secret = SHA256(bot_token)`, HMAC по data-check-string) и свежесть
(≤ 24 ч). Вход возможен ТОЛЬКО при существующей привязке: иначе 403
`<provider>_not_linked` и понятный текст; аккаунт не создаётся, автопривязки по
нику/e-mail/имени нет. Привязка/отвязка — только из «Настройки → Связанные
аккаунты» вошедшим пользователем; занятый чужим аккаунт — 409; события
`auth.external.link/unlink` в audit. Секреты — только в env (`DISCORD_*`,
`TELEGRAM_*`), во frontend уходит лишь `botId`/`botUsername`.

**Update (ADR-0071).** Telegram Login Widget (legacy, Telegram показывает
«deprecated») заменён на OpenID Connect; результат входа/привязки — экран
`/auth/result` вместо редиректов с `?social_error=`/`?link_error=`.

## ADR-0070 — Регистрация с подтверждением почты, реферальным кодом и согласиями

**Context.** Владелец требует: аккаунт создаётся только после подтверждения
почты кодом на той же странице; повтор пароля; необязательный реферальный код;
два отдельных неотмеченных согласия (соглашение + правила; обработка
персональных данных); пароль не должен оседать в URL, storage, логах или
открытом виде в БД до создания аккаунта.

**Decision.** Три шага на `/register`: данные → «Подтвердить почту» → код →
«Создать аккаунт».

- `POST /auth/register/start` — без пароля. Проверяет Turnstile,
  `registrationEnabled`, согласия (`acceptTerms`, `acceptPersonalData` строго
  `true`), свободны ли e-mail и ник (409 `email_taken` / `username_taken`; ник
  не может совпасть с alias входа, ADR-0061), реферальный код (400
  `referral_invalid`; SYSTEM и забаненные не подходят). Создаёт
  `EmailVerification` с HMAC кода (сам код не хранится), TTL 10 минут, и
  отправляет 6-значный код. Ответ — `verificationId`, маска адреса
  (`ne***@twomc.su`), сроки, остаток отправок.
- `POST /auth/register/verify` — не больше 5 попыток (попытка учитывается до
  сравнения), `otp_invalid` + `attemptsLeft`, `otp_expired`, `otp_attempts`
  (429). Верный код → одноразовый токен завершения (в БД — HMAC, 30 минут).
- `POST /auth/register/resend` — cooldown 60 с (429 `otp_cooldown` +
  `retryAt`), до 5 отправок на запрос; новый код заменяет старый, попытки
  обнуляются. На e-mail — не больше 5 запросов кода в час
  (`otp_rate_limited`), плюс IP-лимиты throttler на всех шагах.
- `POST /auth/register/complete` — пароль приходит только здесь и сразу
  хешируется. Токен одноразовый (claim через `consumedAt`), аккаунт создаётся
  с подтверждённой почтой, `referralCode` = ник в верхнем регистре
  (существующим пользователям — backfill в миграции), `referredBy` —
  пригласивший; две записи `LegalConsent` (`terms`, `personal_data`; версия
  `LEGAL_DOCS_VERSION`, по умолчанию `draft`; IP). Сразу выдаётся сессия.
- Прямой `POST /auth/register` закрыт (410) везде, кроме автотестов
  (`NODE_ENV=test`). Флаг капчи `TURNSTILE_DISABLED` на это не влияет.
- Сбой SMTP: production — 503 `mail_failed`, запрос подтверждения удаляется;
  development — предупреждение с кодом в логе разработки. В автотестах письма
  не отправляются.
- Клиент: пароль только в памяти формы; маска e-mail на шаге кода;
  «Отправить повторно через N с», «Изменить E-mail»; при ошибке создания
  (ник/e-mail успели занять, подтверждение устарело) — «Изменить данные» с
  сохранёнными значениями. `OtpInput` сам ставит фокус в первую ячейку при
  появлении и после неверного кода/повторной отправки (`autoFocus` Radix
  0.1.x в ячейки не передаётся), Backspace в пустой ячейке стирает
  предыдущую цифру одним нажатием, вставка целого кода, только цифры.
- Документы — `/legal/{terms,privacy,personal-data,cookies,refunds,info}`;
  пока владелец не передал тексты, страницы честно сообщают «Документ
  готовится к публикации»; `info` — реальные данные владельца.

**Consequences.** Пока почта не подтверждена, пользователя в БД нет.
Незавершённые `EmailVerification` копятся до очистки (политика хранения — в
задаче «Хранилище и журналы»). Доставка кода зависит от SMTP (RISKS R4).
Согласия пишутся с версией `draft`, пока не опубликованы тексты документов.

## ADR-0071 — Единая auth-панель, Telegram OpenID Connect, экран результата соцвхода

**Context.** Владелец: auth-экраны должны быть одной широкой горизонтальной
панелью с визуалом проекта; переключение «Вход | Регистрация» без перезагрузки;
код подтверждения — внутри той же панели, поля остаются видны и заблокированы;
у любых недоступных элементов — курсор недоступности. Telegram Login Widget
(`oauth.telegram.org/auth` с `bot_id`) Telegram помечает как deprecated —
нужен актуальный официальный механизм. После Discord/Telegram пользователь
должен видеть понятный экран результата, а не редирект/JSON.

**Decision.**

- Страницы входа, регистрации, восстановления/сброса пароля и `/auth/result`
  — в группе маршрутов `app/(auth)` с общим layout (`AuthLayout` → `AuthPanel`):
  остров `max-w-[1120px]`, слева логотип, `AuthModeSwitch` (две ссылки с
  `aria-current`, скользящая подложка, `motion-reduce` без анимации) и шаг
  (`AuthShell` — заголовок/описание/содержимое), справа `AuthVisual` —
  основной логотип (постоянный, ADR-0065), векторный узор из блоков и живой
  онлайн серверов (реальный Server List Ping; нет данных — строка скрыта). На
  mobile визуал — компактный баннер сверху, на ширине < 380px скрыт. Layout
  не перемонтируется при переходах — переключение без перезагрузки.
- Регистрация: одна форма на все шаги; после «Подтвердить почту» поля и
  согласия `disabled`, ниже — «Код подтверждения», «Отправить повторно через
  N с» (недоступная кнопка) → «Отправить код повторно»; основная кнопка:
  «Подтвердить почту» → «Подтвердить код» → «Создать аккаунт». Реферальный код
  — «Необязательно», placeholder «Введите код», без примеров.
- Недоступные элементы: `Button`/`SegmentedControl` больше не используют
  `pointer-events-none` (с ним курсор не меняется) — `cursor: not-allowed`, у
  недоступных hover/active сброшены; загрузка — `cursor: wait`; глобальный
  fallback `:disabled, [aria-disabled=true] { cursor: not-allowed }` до
  собственного курсора проекта.
- Telegram — OpenID Connect (core.telegram.org/bots/telegram-login):
  `GET /auth/telegram/start` / `POST /auth/telegram/link-url` → редирект на
  `https://oauth.telegram.org/auth` (`response_type=code`, `scope=openid
profile`, `state`, `nonce`, PKCE `S256`; verifier — в httpOnly-cookie
  `social_pkce`, path `/auth`, 10 минут) → `GET /auth/telegram/callback`:
  проверка state/nonce-cookie, обмен кода на `https://oauth.telegram.org/token`
  (Basic `client_id:client_secret` + `code_verifier`), проверка `id_token`
  по JWKS (`node:crypto`, RS256/ES256/EdDSA; `none`/HS* запрещены; `iss`,
  `aud` = Client ID, `exp`, `nonce`; при неизвестном `kid` — один повтор со
  свежим JWKS). Telegram user id — claim `id` (тот же, что у прежних
  привязок). Env: `TELEGRAM_CLIENT_ID` (по умолчанию id бота из токена),
  `TELEGRAM_CLIENT_SECRET`, `TELEGRAM_REDIRECT_URI`. Без секрета провайдер
  выключен (кнопка не показывается). Legacy `POST /auth/telegram/{login,link}`
  удалены.
- Discord и Telegram — один обработчик `GET /auth/:provider/callback`; режим
  login/link — в подписанном state. Итог — редирект на
  `/auth/result?provider&mode&status&next` (статусы `success`, `linked`,
  `already_linked`, `not_linked`, `taken`, `slot_taken`, `cancelled`,
  `expired`, `unavailable`, `error`). В URL нет токенов, кодов, секретов и
  ответов провайдера; сессия — только httpOnly refresh-cookie. `link()` для
  того же аккаунта возвращает `already_linked` (не ошибка); другой аккаунт
  этого сервиса у пользователя — `provider_slot_taken`.
- `SocialAuthResult` — общий компонент: логотип twomc.su + логотип провайдера,
  иконка статуса, заголовок, описание, действия («Продолжить» с автопереходом
  через 4 с, «Вернуться ко входу», «Вернуться в настройки», «Повторить»).
- Design-lab, раздел «Auth» — те же компоненты (`AuthPanel`, `LoginForm
preview`, `RegisterForm previewStep="code"`, `SocialAuthResult`).

**Consequences.** Telegram-вход заработает после настройки BotFather (Login
Widget → OpenID Connect, Allowed URL callback, Client Secret в env) —
RISKS R18. Локально Telegram OIDC не проверить (localhost в Allowed URLs не
принимается) — поток покрыт unit-тестами (подпись, claims, PKCE) и e2e с
подменённым обменом кода.

## ADR-0072 — Tutorial регистрации, привязка Minecraft (`/site-connect`), тени без рамок

**Context.** Владелец: поверх auth-панели — пошаговый tutorial (6 этапов, у
каждого скриншот, YouTube/RuTube); регистрация — почта → Minecraft
(`/site-connect` → 15 символов на сайте → 5 символов в игре) → аккаунт; всё
server-authoritative; поля регистрации без пустот, регистрация помещается без
прокрутки; убрать «обведённые» модули. Механизма привязки Minecraft не было ни
в старом, ни в новом проекте (ADR-0041: RCON нет, плагина нет).

**Decision.**

- Tutorial — production Dialog (`AuthTutorial`, ~860px, desktop: скриншот слева,
  mobile: сверху; «Этап N из 6», полоса прогресса, Назад/Далее/Понятно, стрелки,
  Esc, focus trap Radix). Вся конфигурация — `lib/auth/tutorial.ts`: этапы,
  слоты скриншотов (`src: null` → явно помеченный временный макет; реальных
  скриншотов в проектах нет), команда, видео из env
  (`NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL`/`RUTUBE_URL`, только https и домен
  платформы; нет URL — нет кнопки; переход через ExternalLinkGuard).
  `FORCE_AUTH_TUTORIAL = true` — временно показывать при каждом открытии
  /login и /register; `false` — только регистрация и только впервые
  (localStorage). Tutorial ничего не выполняет и не связан с состоянием
  регистрации.
- Привязка Minecraft — модуль `minecraft-link`: `MinecraftConnectSession`
  (ссылка и 15-символьный код — только HMAC, TTL 10 минут, одноразово, ≤ 6 на
  UUID в час), поля Minecraft-стадии в `EmailVerification` (5-символьный код —
  HMAC, TTL 5 минут, 5 попыток, попытка учитывается до сравнения),
  `MinecraftAccount` (`uuid` и `userId` уникальны) — создаётся той же вставкой,
  что и пользователь. Ник сеанса обязан совпадать с ником регистрации; UUID,
  привязанный к другому аккаунту, — 409 `minecraft_taken`; повтор кода —
  `mc_code_used` (claim через `updateMany … usedAt: null`).
- Плагин ↔ API: HMAC-SHA256 общим секретом `MINECRAFT_PLUGIN_SECRET`, метка
  времени ±60 с, каноническая строка (timestamp, METHOD, path, поля тела по
  алфавиту) — `docs/implementation/MINECRAFT-PLUGIN-CONTRACT.md`. Команды в
  игре: `/site-connect` и `/site-connect <код>`. Шаг Minecraft обязателен,
  только когда секрет задан: без плагина подтвердить код в игре невозможно,
  и регистрация не должна быть заблокирована; без фальшивого успеха.
- Продолжение после перезагрузки: `POST /auth/register/state` (стадия
  email/minecraft/create с сервера); клиент хранит в sessionStorage только
  `verificationId` и токен завершения — пароль нет (на последнем шаге его
  вводят снова).
- Глобально: тени без колец `0 0 0 1px` и без светлой верхней кромки
  (`--edge-highlight: transparent`, утилита `.edge-highlight` удалена из 37
  файлов) — источник «обведённых карточек» был в токенах.
- Регистрация плотнее: логотип + переключатель в одну строку, grid полей
  `items-start`, требования — в подписи поля, «Политика конфиденциальности» —
  строка группы согласий без чекбокса; панель 677px — помещается в 1366×768.

**Consequences.** Production-привязка заработает после плагина на серверах
TwoMC (RISKS R20). Скриншоты tutorial и официальный SVG RuTube — от владельца.

## ADR-0073 — Превью профиля по нику, варианты отображения пользователя

**Decision.** `GET /users/:username/summary` (OptionalJwt) — лёгкая карточка:
роли (slug/displayName/priority/color), должность, аватар, дата регистрации,
онлайн (`isOnlineInGame` + сервер) или последняя активность, статистика
(`PlayerStatistics`) только если игрок её не скрыл (`hideStatistics`, владелец
видит всегда) и она реально есть, счётчики друзей (ACCEPTED) и выполненных
достижений. Нет данных — `null`, без выдуманных нулей. Профиль `NOBODY`/
`FRIENDS_ONLY` для посторонних — только `{ username, hidden: true }` (как у
публичного профиля); `GET /users/:u/achievements` теперь тоже скрыт для таких
профилей (раньше раскрывал достижения). Frontend: `ProfilePreview` — hover card
на desktop (наведение и фокус), нижний sheet на touch/mobile, запрос только при
открытии; `UserIdentity` — варианты `stacked`/`inline` и `previewable`;
`RolePrefix` сжимает длинный PNG пропорционально (`object-contain`), а не
сплющивает. Подключено в админке: «Пользователи», «Журнал аудита».

**Consequences.** Страницы `/u/[username]` пока нет — ссылки «Открыть профиль»
в превью нет (появится с публичной страницей профиля, Product Completion).

## ADR-0074 — Уведомления: действия, единый счётчик, мгновенное обновление

**Decision.** Backend: `PATCH /notifications/:id/unread`, `DELETE /notifications/read`
(прочитанные), `DELETE /notifications` (все); после любого изменения (и создания)
WS `/notifications` шлёт `notification:changed { unreadCount }` в комнату
пользователя. `?unreadOnly=false` больше не превращается в `true`; отправитель в
списке — только `id/username/avatar`. Frontend: единственный источник числа —
`siteKeys.unread` (бейдж, превью, страница, title, favicon), формат —
`formatBadgeCount` (1–99, «99+», 0 — без бейджа); действия
(`useNotificationActions`) обновляют кэш оптимистично и сверяются с сервером;
один сокет на вкладку (`useNotificationsRealtime` в `DocumentBadge`), опрос раз в
60 с — запасной путь. `NotificationItem` — кнопки при наведении/фокусе (на touch
всегда) и те же действия в ПКМ; «Удалить прочитанные» и «Очистить все» — с
подтверждением. Страница `/notifications`: фильтр «Все/Непрочитанные», «Показать
ещё». `socket.io-client` добавлен в web (та же версия, что в api).

## ADR-0075 — Собственный курсор «Полдня»

**Decision.** Шесть SVG-курсоров (`apps/web/public/assets/cursors/`): default
(светлая стрелка с тёмным контуром), pointer (та же стрелка, оранжевый акцент
`--primary`), text (I-beam), grab/grabbing (стрелки перемещения, при нажатии —
оранжевые), not-allowed (стрелка с запретом). Подключение — CSS в
`globals.css` только под `@media (pointer: fine)` (мышь/тачпад; на touch —
системный), у каждого `url()` — fallback на стандартное ключевое слово.
Приоритет недоступности: правило not-allowed объявлено последним и
перекрывает pointer/text (кнопки, ссылки с `aria-disabled`, `label:has(:disabled)`).
Класс `html.no-custom-cursor` выключает курсор целиком (точка для будущей
настройки). Design-lab: раздел «Курсоры».

## ADR-0076 — Date Picker: виды «день / месяц / год»

**Decision.** Заголовок календаря — кнопка: дни → месяцы (сетка 3×4 года) →
годы (окно 12 лет: 5 назад и 6 вперёд от просматриваемого, листание по 12).
Выбор года возвращает к месяцам, выбор месяца — к дням. Месяцы и годы вне
`min`/`max` недоступны; стрелки «назад/вперёд» листают месяц/год/12 лет по виду.
Клавиатура в сетках месяцев/лет: ←/→ ±1, ↑/↓ ±3; в сетке дней — как раньше.
Недоступные даты больше не используют `pointer-events-none` (курсор
недоступности, ADR-0075).

## ADR-0077 — Собственное контекстное меню, политика выделения, защищённые изображения

**Decision.** `SiteContextMenu` в `Providers`: один слушатель `contextmenu` на
document (фаза всплытия — собственные меню компонентов, например уведомлений,
срабатывают раньше и не перехватываются). Меню открывается у курсора (Radix
DropdownMenu с виртуальным якорем), клавиатура и Esc — от Radix. Цель
(`resolveContextTarget`): выделенный текст → `[data-context]` (user/product;
изображение внутри карточки → сущность) → ссылка (внешняя — без «Открыть»,
только новая вкладка/копирование) → изображение → страница (назад, вперёд,
обновить, копировать адрес). Permission-aware: «Админ-панель» — только с
`ADMIN_ENTRY_REQUIREMENT`. Нативное меню остаётся: на touch (`pointer: fine`
не выполняется), по Shift+ПКМ, в полях ввода (вставка, орфография). Все
действия доступны и обычными элементами интерфейса; DevTools не блокируются.
Политика выделения: текст контента выделяется, элементы управления (кнопки,
подписи, вкладки, пункты меню, навигация) — нет. `ProtectedImage`
(next/image без drag, select-none, без iOS touch-callout) — для картинок
товаров; аватары без drag. Это защита от случайного копирования, не DRM.

## ADR-0078 — Админка «Полдень»: плавающие острова, графики на реальных данных

**Decision.** Сайдбар и шапка админки — плавающие острова (отступ от краёв,
`rounded-xl`, мягкая тень, без разделительных рамок); карточки статистики — без
рамки. Графики — Recharts v3 (`recharts ^3.10.1`) через переиспользуемый
`TimeSeriesChart` (цвета из токенов темы, приглушённая сетка, solid-подсказка,
без анимации при reduced-motion, figcaption с итогами для screen reader).
Данные только реальные: `GET /admin/dashboard/timeseries?days=7..90`
(`dashboard.view`) — регистрации (без SYSTEM), новые жалобы (три вида), действия
аудита по дням UTC, нули из `generate_series`; финансы — `salesByDay` (API
отдаёт только дни с продажами, клиент строит окно 30 дней с нулями). Дашборд —
переключатель периода 7/30/90.

**Consequences.** Ряда онлайна игроков нет: `ServerStatusLog` пишется только при
запросе статуса, без периодического сборщика — график онлайна не рисуется, пока
не появится сборщик (Product Completion).

## ADR-0079 — Сезонная система: настройки в админке, серверное время, эффекты

**Decision.** Реестр кампаний (окна по умолчанию, приоритеты, сезонная «o»,
декор, эффект) остаётся в web `lib/site/seasonal.ts`. Сервер хранит только
настройки — singleton `SeasonalSettings` (`seasonal_settings`, id `global`):
ON/OFF целиком, режим `auto | forced` (+ `forcedCampaignId`), флаги
`showWordmarkO / showDecoration / showEffects / showBanners`, плотность эффектов
1–3 и переопределения кампаний `{ enabled, startsAt, endsAt, effects }` (JSON;
`effects` — свой набор до 3 эффектов, `[]` — без эффектов, null — набор кампании
по умолчанию; эффекты не привязаны жёстко к празднику).
`GET/PATCH /admin/settings/seasonal` — права `settings.seasonal.view/edit`,
изменение пишется в аудит `settings.seasonal.update` с diff полей.
`/site/settings.seasonal` отдаёт настройки и `serverTime`; кампанию выбирает
клиент по реестру, но по времени сервера (api не импортирует `@twomc/shared`,
список id продублирован в DTO для валидации). `useSeasonal()` считает состояние
только после монтирования — SSR и гидрация всегда без сезонных элементов.
Эффекты — один canvas (`pointer-events: none`, `z-effects` = 40: поверх
оболочки, ниже модалок), rAF с паузой в скрытой вкладке, частиц
`плотность × ширина / 40 ≤ 120`, DPR ≤ 2, при `prefers-reduced-motion` не
рисуются; несколько эффектов делят один бюджет частиц; на слабых устройствах
(≤ 4 ядер или ≤ 4 ГБ) — половина частиц и DPR 1, при экономии трафика — 40 %;
отдельный чанк `next/dynamic` (`ssr: false`). Даты в форме — дата + время в
часовом поясе администратора с подписью пояса (`Europe/Moscow (UTC+3)`),
хранятся в UTC. Предпросмотр во вкладке — любая кампания, «Компьютер/Телефон»,
тёмная/светлая тема (вложенный `data-theme`), те же компоненты, что на сайте
(wordmark, декор шапки, `EffectsCanvas contained`); «сейчас на сайте» считается
по времени сервера (смещение из `/site/settings`). Основной логотип сезоны не
меняют (ADR-0065) — `halloween_logo.png` не используется.

**Consequences.** Новая кампания = запись в реестре web + id в
`SEASONAL_CAMPAIGN_IDS` DTO. Сезонные баннеры пока только флаг — компонента
баннеров нет (Product Completion). Миграция аддитивная (CREATE TABLE).

## ADR-0080 — Системные сообщения от имени twomc.su

**Decision.** Системное сообщение — уведомление типа `SYSTEM` с
`metadata.sender = 'system'` и приоритетом HIGH, без `fromUser`. Такой тип
создаёт только сервер (`CommunicationsModule`) по запросу администратора с
правом — пользователь не может прислать уведомление, поэтому подделать
отправителя нельзя. В центре уведомлений оно показано как «twomc.su ·
Системное» (основной логотип, метка), на `/notifications` — фильтр «От twomc.su»
(`GET /notifications?type=system`). Личная беседа в ЛС не используется: на
системное сообщение нельзя ответить, а беседа «только для чтения» в модели ЛС
отсутствует. Маршруты `admin/communications`: `GET recipients?q=` (право send
или bulk), `POST messages` (`communications.messages.send`, 20/мин),
`POST messages/bulk/preview` и `POST messages/bulk`
(`communications.messages.bulk`, 3/мин; аудитория all | role | users ≤ 100;
`confirmCount` должен совпасть с числом получателей на момент отправки, иначе
409). Получатели — только обычные активные аккаунты (не SYSTEM, не
забаненные). Доставка игнорирует отключение типа в настройках пользователя
(`bypassPreferences`). Аудит явный: `communications.message.send` /
`communications.message.bulk` (warning) — заголовок, длина текста, ссылка,
аудитория и число получателей; полный текст в аудит не пишется. Ссылка —
только внутренний путь `/…` или `https://…`.

**Consequences.** Массовая рассылка выполняется синхронно O(n), как прежний
broadcast — при большой аудитории нужна очередь (Product Completion).
Объявления (баннеры, расписание, места показа) — отдельный срез.

## ADR-0081 — Объявления: типы, расписание, аудитория, места показа

**Decision.** Существующая модель `Announcement` расширена аддитивно:
`placements` (`banner` — сайт под шапкой, в обычном потоке страницы, не в
sticky-шапке; `notifications` — центр уведомлений; `dashboard` — главная
админки), `audience` (`all` | `users` | `role` + `targetRole` = `Role.name`),
`publishedAt`, `notifiedAt`, `updatedBy`. Старые записи broadcast получают
пустые `placements` и нигде не появляются. Типы семантические: info, important,
warning, update, event, maintenance («Информация», «Важно», «Предупреждение»,
«Обновление», «Событие», «Технические работы»); прежние success/danger читаются
как update/important без миграции данных. Статус вычисляется сервером: черновик
(`isActive = false`, нет `publishedAt`), запланировано, показывается, срок
истёк, снято. Создание и изменение — без публикации; публикация требует хотя бы
одного места и непрошедшего срока; удалить можно только неопубликованное.
Публично — `GET /site/announcements?placement=banner|dashboard` (гость или
вошедший, `OptionalJwtAuthGuard`), фильтр по окну показа на времени сервера и
по аудитории. Уведомления (`ANNOUNCEMENT`, для «Технических работ» —
`MAINTENANCE`) рассылаются ровно один раз: атомарный захват `notifiedAt` при
публикации, если показ уже начался, иначе фоновым обработчиком
`AnnouncementsScheduler` (раз в минуту в процессе API, в тестах выключен).
Посетитель может скрыть закрываемое объявление — это хранится в его браузере.
Права `announcements.view` / `announcements.manage`; аудит
`announcements.create|update|publish|unpublish|delete` с diff (текст — длиной).
Раздел админки — «Коммуникации → Объявления» (вместе с вкладкой «Верхняя
плашка»); `/admin/broadcast` перенаправляет туда, старый `POST
/admin/broadcast` оставлен для совместимости.

**Consequences.** Рассылка уведомлений — синхронная O(n), как и прежде; при
большой аудитории нужна очередь. Фоновый обработчик — первый in-process job;
очистка журналов (мини-roadmap) переиспользует тот же подход.

## ADR-0082 — Модули сайта и технические работы

**Decision.** Реестр модулей (`apps/api/src/modules/system/site-modules.registry.ts`)
отражает код: ключи обычных и защищённых модулей — это метки
`@SiteModule(key)` на реальных публичных контроллерах API, а unit-тест сверяет
реестр с кодом в обе стороны. Уровни: core — вход и регистрация, роли и права,
админ-панель, мониторинг. Маршруты ядра не помечаются и не закрываются никогда,
иначе не восстановить доступ. protected — уведомления, профили, магазин:
выключение только с правом `system.modules.protected`, подтверждением и аудитом
critical. regular — остальные. Глобальный `SiteModuleGuard` отвечает на маршрут
выключенного модуля или модуля на техработах `503 { code: MODULE_DISABLED |
MAINTENANCE, module }` — без 500 и без пустых ответов. Админские контроллеры
не помечаются: выключенным модулем можно управлять. Вебхуки платежей и сайтов
голосования не закрываются (`@SkipSiteModule`), чтобы не терять внешние
события. Обход для сотрудников — право `system.maintenance.bypass`, токен
проверяется в guard'е, так как глобальные guard'ы срабатывают до
JwtAuthGuard. Источник состояния — `ModuleStatus`; прежние флаги
`SiteSettings.*Enabled` служат значением по умолчанию, пока записи нет
(колонки не удалены). `/site/settings.modules` считается из реестра.
Техработы — singleton `MaintenanceMode` (id `global`), расширенный аддитивно:
`scope` full | partial, `modules`, `startsAt` (плановое начало), `estimatedEnd`
(ожидаемое окончание, само не выключает), `reason` (внутренняя, публично не
отдаётся). Полные закрывают все помеченные модули; вход и админка работают;
на сайте вместо `AppShell` показывается экран техработ, сотрудники с обходом
видят сайт с плашкой. Публичный `GET /site/status` — техработы и выключенные
модули. Состояние кэшируется в процессе на 5 с, запись из админки сбрасывает
кэш сразу. Web перечитывает статус раз в минуту, при возврате на вкладку и при
любом ответе 503 с кодом недоступности. Страницы модулей обёрнуты в
`ModuleGate` («Раздел временно недоступен»). Хранилище состояния —
абстракция `SiteStatusStore`: e2e подменяют его хранилищем в памяти, чтобы не
выключать модули параллельным наборам. Права:
`system.maintenance.view|manage|bypass`, `system.modules.view|manage|protected`.
Аудит: `system.module.enable|disable`, `system.maintenance.enable|update|disable`
с diff.

**Consequences.** WebSocket-шлюзы (чат, ЛС) guard не проверяет — закрыты их
REST-методы, а интерфейс прячет модуль. Флаги модулей убраны из «Настройки →
Модули»: там остались умолчания аккаунтов и ссылка на новый раздел.

## ADR-0083 — Навигация админки по группам, быстрые действия, сводка состояния

**Decision.** Боковое меню админки сгруппировано по ТЗ: Обзор, Люди и доступ,
Контент, Финансы, Коммуникации (сообщения, объявления), Оформление (сезонное
оформление), Система (техработы и модули, настройки), Безопасность, Аудит,
Инструменты. Пункт и группа видны только при нужных правах. Сезонное
оформление вынесено из «Настроек» в отдельный раздел `/admin/appearance`:
его права (`settings.seasonal.*`) не должны требовать прав на общие настройки.
На дашборде — сводка состояния проекта: текущая сезонная кампания (по времени
сервера), техработы (идут, запланированы или не идут), выключенные модули,
активные объявления, здоровье БД и Redis. Данные — из `GET
/admin/system/overview` (`dashboard.view`), только реальные значения;
плитка ведёт в раздел, если на него есть право. Быстрые действия (создать
объявление, системное сообщение, включить техработы, оформление, модули)
показываются только при наличии права. Переход на нужную вкладку —
параметрами `?tab=` и `?new=1`, они читаются после монтирования, без
`useSearchParams`.

**Consequences.** Новые разделы добавляются в существующую группу, а не
отдельной строкой. Сводка обновляется раз в минуту.

## ADR-0084 — Хранилище и журналы: сроки хранения и очистка

**Decision.** Очищаются только служебные журналы, четыре категории с явными
условиями:

- **аудит** — `audit_logs`, `role_assignment_logs`;
- **безопасность** — история входов: только завершённые (отозванные) и
  истёкшие сессии `refresh_tokens`, активные не трогаются;
- **статусы серверов** — `server_status_logs`;
- **технические записи** — использованные или истёкшие коды сброса пароля и
  привязки Minecraft, действующие не трогаются.

Пользовательские данные (профили, сообщения, заказы, уведомления, файлы) в
категории не входят. Неиспользуемые загрузки по-прежнему стирает ежедневная
очистка `FilesService`. Настройки — singleton `StorageRetention` (аддитивная
миграция): срок по категории — 7, 30, 90, 180, 365 дней или 0 («не удалять»);
`AUDIT_RETENTION_DAYS` — значение по умолчанию для аудита. Автоочистка — раз в
сутки в 04:00 (`StorageRetentionScheduler`, заменил таймер в `AuditService`;
`cleanupOld()` оставлен). Ручная очистка: период (старше N дней или «все»),
предпросмотр числа записей и оценки объёма по `pg_total_relation_size`,
подтверждение. Если записей к удалению стало больше, чем было в
предпросмотре, сервер отвечает 409. Аудит и безопасность — отдельное право
`system.storage.audit` (журналы аудита и безопасности отделены от
остальных). Очистка пишется в аудит после удаления, поэтому сама запись не
удаляется: `system.storage.cleanup` (critical для чувствительных категорий),
`system.storage.update` — с diff. Автоматический запуск пишется от имени
системного аккаунта, если он есть. Права `system.storage.view|manage|audit`;
раздел «Система → Хранилище и журналы».

**Consequences.** Оценка объёма приблизительная: средний размер строки ×
число записей. Освобождение места на диске — за VACUUM PostgreSQL.

## ADR-0085 — Флаги языков и emoji: единый вид

**Decision.** Флаги языков — SVG (`components/ui/flag-icon.tsx`: Россия,
Великобритания), а не emoji: регионально-индикаторные символы на Windows и
части Linux выводятся буквами («GB»). Флаг декоративный (`aria-hidden`),
подпись языка всегда рядом текстом; пропорции 3:2, тонкий контур, чтобы белая
полоса не терялась на светлом фоне. Иконки интерфейса — только библиотека
иконок (lucide). Защитный тест проверяет, что в исходниках web нет emoji и
флагов-индикаторов: ни вместо иконок поиска, настроек, безопасности,
пользователей, уведомлений, чата и корзины, ни где-либо ещё. Для emoji,
которые введут пользователи (реакции, чат и ЛС — волна Social), выбран единый
картинный источник с допустимой лицензией: Twemoji (графика CC-BY 4.0,
поддерживаемый форк `jdecked/twemoji`, изображение по кодовой точке) с
указанием авторства на странице правовой информации. Оригинальная графика и
шрифты Apple не используются: лицензия этого не позволяет.

**Consequences.** Новый язык — это код флага в `FlagCode` и SVG в
`flag-icon.tsx`. Компонент вывода emoji появится вместе с реакциями (волна
Social), до этого emoji в интерфейсе нет.

## ADR-0086 — Offline / Fallback UX

**Decision.**

- **Проверка связи.** Источник истины — проверка API (`GET /health`, таймаут
  5 с, `no-store`). `navigator.onLine` и события `online`/`offline` — только
  повод перепроверить. Состояния:
  - `online` — API отвечает;
  - `api-down` — сайт открывается (уникальный URL `/icon.png?connectivity=…`
    мимо кэша SW), сервер не отвечает или отдаёт 5xx;
  - `offline` — не открывается и сайт.

  Проверку запускает и любой сбой запроса из `QueryCache`/`MutationCache`:
  сеть или 502/503/504 без кода. 503 техработ и выключенного модуля
  (ADR-0082) — штатный ответ, не сбой связи. Пока связи нет, повторы идут с
  паузой 5 → 10 → 20 → 40 → 60 с. Плашка показывает обратный отсчёт и кнопку
  «Повторить»; уже загруженное остаётся на экране. После восстановления —
  тост и перезапрос данных.

- **Частичный сбой.** Каждая секция — свой `QueryBoundary`/`ErrorState` с
  повтором: недоступная часть не ломает страницу. `ErrorState` различает
  сеть, техработы, выключенный модуль и 5xx.
- **Service Worker** (`public/sw.js`, только production-сборка;
  `NEXT_PUBLIC_SW_DISABLED=true` снимает его у посетителей):
  - навигация — всегда из сети, без сети — предзагруженная `/offline` вместе
    с её CSS, JS и шрифтами;
  - неизменяемая статика (`/_next/static`, `/assets`, `/fonts`) — из кэша;
  - никогда не кэшируются: API (другой origin), запросы с `Authorization`,
    HTML страниц, запросы с параметрами, не-GET.

  `sw.js` отдаётся с `Cache-Control: no-cache`; при активации старые версии
  кэша удаляются.

- **Страница `/offline`** — статическая, без запросов к API и CDN.

**Consequences.** Брендированные страницы ошибок Cloudflare (недоступен сам
origin, посетитель без SW) отложены — RISKS R21. Dev-прокси не нужен: проверка
работает на любом origin API.

## ADR-0087 — Auth-пакет: провайдеры, согласия, tutorial, тестовый OTP, числовые поля

**Context.** Telegram на экране входа то появлялся, то исчезал; кнопка
регистрации нажималась без согласий; tutorial открывался принудительно на
любом auth-экране, а его прогресс был некликабельной полосой; кнопок видео не
было видно; для разработки нужен детерминированный OTP; поля кода и числа
показывали нативные стрелки браузера.

**Decision.**

- **Провайдеры входа.** Discord и Telegram отображаются всегда, в одной сетке.
  Ненастроенный или временно недоступный провайдер — `aria-disabled` с
  подсказкой «Вход через … временно недоступен»; ошибка проверки списка —
  обе кнопки недоступны и «Повторить». Провайдер не исчезает молча. Причина
  исчезновения: `enabled=false` (нет `TELEGRAM_CLIENT_SECRET`) удалял кнопку
  после загрузки, ошибка запроса скрывала блок целиком.
- **Согласия.** «Подтвердить почту» — `disabled` (нельзя нажать ни мышью, ни
  Enter), пока не отмечены оба согласия; рядом — подсказка, связанная через
  `aria-describedby`. Сервер проверяет согласия повторно (`@Equals(true)`).
  Строка «Политика конфиденциальности» — в том же legal-блоке, отделена тонкой
  линией, без чекбокса.
- **Tutorial.** Сам открывается только при входе в регистрацию (`/register`,
  включая переключение «Вход → Регистрация»), один раз за вкладку
  (`sessionStorage`); на входе — нет. Вручную — кнопка «Как
  зарегистрироваться». Dialog шире (`72rem`): шапка, навигация, тело
  «скриншот + инструкция» (на mobile — друг под другом), футер «Назад /
  Далее / Понятно». Навигация — 6 кнопок-сегментов (пройден / текущий /
  впереди, hover, focus-visible), все шаги открываются свободно.
  «Видеоинструкция»: YouTube и RuTube видны всегда; без URL — недоступны с
  подсказкой «Видео готовится», на `#` не ведут. Официального логотипа RuTube
  нет в Simple Icons — слот `RUTUBE_ICON_SRC` для файла владельца, до него —
  нейтральная иконка.
- **Тестовый OTP.** `AUTH_TEST_OTP_ENABLED=true` и `NODE_ENV !== production`:
  `123456` — код принят, `000000` — гарантированный отказ. Только backend
  (`test-otp.ts`); production с `true` не проходит валидацию env, по
  умолчанию `false`.
- **OTP-поле.** Собственный компонент без Radix: ячейки `type="text"` +
  `inputMode="numeric"`, вставка, Backspace/Delete, стрелки, Home/End,
  состояния invalid / success / loading / disabled.
- **Числовые поля.** `type="number"` запрещён (guard-тест): `NumberStepper` —
  текстовое поле с ролью `spinbutton` и ↑/↓; простые поля — `inputMode`.
  CSS-страховка скрывает нативные стрелки.
- **Service Worker.** Вне production регистратор снимает SW и его кэши: dev-
  чанки Next не хешированы, cache-first отдавал старый код. `/assets` и
  `/fonts` — stale-while-revalidate (замена файла видна при следующем
  открытии), `/_next/static` — cache-first; версия кэша `v2`.
- **Статус серверов.** Без `NEXT_PUBLIC_STATUS_PAGE_URL` кнопка ведёт на
  встроенную `/status` (status.twomc.su пока недоступен).

**Consequences.** Нужен от владельца официальный SVG RuTube и URL видео (R20);
Telegram-вход включится после `TELEGRAM_CLIENT_SECRET` (R18).

## ADR-0088 — Медиа пользователя и единая identity: URL на сервере, mini profile

**Context.** Аватар и баннер загружались, но на сайте не отображались. В БД
лежит ключ хранилища (`users/<id>/avatar/<uuid>.avif`), и API отдавал его как
есть. Браузер разрешал ключ относительно текущей страницы и получал 404.
Шапка и админка вообще не передавали `src`, в `/auth/me` не было аватара.
`helmet` ставил `Cross-Origin-Resource-Policy: same-origin`, и сайт с другого
origin не мог показать файл `/uploads`. После загрузки кэш превью не
сбрасывался. Меню профиля было списком ссылок.

**Decision.**

- **URL медиа строит только сервер.** `StorageService.publicUrl()`: ключ →
  `CDN_BASE_URL/ключ`; уже абсолютный `http(s)` (старые записи) — как есть;
  пусто → `null`. Через него идут все ответы с медиа пользователя: профили,
  summary, `/auth/me`, рейтинги, «недавно купили», коммуникации,
  уведомления, ЛС, админка пользователей. Web не склеивает URL.
- **`/uploads`** (локальный драйвер) — `Cross-Origin-Resource-Policy:
cross-origin`.
- **Кэш.** После загрузки или удаления сбрасываются профиль, превью и
  публичный профиль, `/auth/me` перечитывается.
- **Единая identity.** `ProfileHeader` и `ProfileBanner`
  (`components/profile`) — один вид для превью по нику, mini profile и
  design-lab. Баннер — реальный или нейтральная поверхность, без градиентов и
  битых картинок. Аватар частично накладывается на баннер. Далее ник с
  префиксом роли, ID, бейджи (`UserBadge`), медиа-бейджи и украшение
  (`ProfileBadges`), присутствие — только при реальных данных. Summary
  дополнен `shortId`, `banner`, `badges`, `mediaBadges`, `decoration`.
- **Mini profile.** Шапка → компактная статистика (друзья, достижения, время
  в игре) → меню: Мой профиль, Настройки, Сообщения, Друзья, Избранное,
  Заказы. Разделы, которых ещё нет, недоступны с пометкой «скоро». Админ-панель
  — по effective permission, «Выйти» — отдельно. Desktop — меню-popover,
  mobile — bottom sheet. Источник данных общий: `/auth/me` (шапка сразу) и
  summary (бейджи, статистика, присутствие).
- **Avatar.** `image-rendering: pixelated` — только для голов Minecraft;
  загруженное фото масштабируется сглаженно.
- **Меню.** Недоступный пункт — курсор `not-allowed` вместо
  `pointer-events: none`.

**Consequences.** Страниц друзей, комментариев и чата в web ещё нет, их API не
отдаёт аватары — при создании UI (волна 2) использовать `publicUrl` и
`ProfileHeader`. В production `CDN_BASE_URL` = `cdn-files.twomc.su` (R3).

## ADR-0089 — 3D-скин Minecraft в профиле

**Context.** На `/u/[ник]` нужен интерактивный 3D-просмотр скина игрока. Своего
источника скинов у проекта нет, плагина серверов ещё нет (R20).

**Decision.**

- **Источник — официальный API Mojang, через сайт.** API находит профиль по
  нику (`api.minecraftservices.com/.../lookup/name`), берёт свойство
  `textures` из `sessionserver.mojang.com` и скачивает текстуры только с
  `textures.minecraft.net` (https, ≤ 64 КБ, PNG: скин 64×64 или 64×32, плащ
  2:1). Браузер к Mojang не обращается.
- **Чей скин.** Ник из привязанного `MinecraftAccount`, иначе ник сайта (он же
  Minecraft-ник, ADR-0072). Только зарегистрированные пользователи с
  профилем, видимым не только владельцу. Для несуществующего и скрытого
  профиля — одинаковый 404: эндпоинт не служит открытым прокси и не
  раскрывает наличие аккаунта.
- **Кэш в памяти процесса:**
  - найденный скин — 6 ч, «нет скина» — 30 мин, сбой Mojang — 2 мин (старое
    значение отдаётся дальше);
  - не больше 1000 записей, одновременные запросы к одному нику объединяются.
- **Эндпоинты** (модуль сайта `profiles`):
  - `GET /users/:ник/skin` — `{ available, model, cape, version }`;
  - `GET /users/:ник/skin.png`, `GET /users/:ник/cape.png` — PNG с CORP
    `cross-origin` и `Cache-Control` на 1 ч; `?v=version` сбрасывает кэш
    браузера при смене скина.
- **Web** (`components/profile/skin-viewer.tsx`): `skinview3d` (three.js)
  загружается через `import()` только когда блок виден на экране:
  - вращение мышью и пальцем, zoom в пределах, без сдвига;
  - idle-анимация с паузой, кнопки поворота и «Сбросить вид»;
  - модель slim/classic, плащ;
  - reduced motion — без анимации;
  - без WebGL — плоская текстура;
  - слабое устройство или экономия трафика — 3D по кнопке;
  - нет скина — честное пустое состояние.

**Consequences.** Сервер, похоже, работает в offline-режиме, и у ников без
лицензии скина нет — показывается пустое состояние (R22). Когда появится
плагин (R20), добавится второй `SkinSource` (SkinsRestorer или скин с
сервера) без изменений web. При нескольких инстансах API кэш стоит перенести
в Redis.

## ADR-0090 — Сезоны: падающий эффект независимо, звёзды Дня Победы, состояние украшения шапки

**Context.** Падающий эффект показывался только при активной кампании
(`showEffects` объединялся через «И» с сезоном). У Дня Победы был эффект
«солнце» (круги). Украшение шапки при включённом флаге было не видно: ассет
подключён CSS-фоном прямо с `cdn-files.twomc.su`, и ошибка загрузки не
отображалась нигде — полоса просто пустая.

**Decision.**

- **Независимые настройки** (`seasonal_settings`, миграция только добавляет
  колонки):
  - `enabled` — сезонная система;
  - оформление сезона: `showWordmarkO`, `showDecoration` (украшение шапки),
    `showBanners`;
  - падающий эффект: `fallingMode` (`season` — эффекты активной кампании,
    `always` — `fallingEffect` всегда, даже без сезона, `off` — ничего),
    `effectIntensity` (плотность), `effectSpeed` (скорость 1–3).

  `showEffects` остаётся для совместимости и равен `fallingMode != off`;
  старое `showEffects=false` при миграции перешло в `off`. Режим `always` без
  типа — 400.

- **Один расчёт** `resolveSeasonalView()` для сайта и превью админки. Превью
  примеряет любую кампанию без активации сезона и отдельно переключает
  оформление сезона и падающий эффект. Режим «Выключен» превью тоже
  показывает выключенным.
- **День Победы** — эффект `stars`: красные пятиконечные звёзды, векторный
  путь на canvas (не emoji). Радиус 3–7 px, медленное вращение, вдвое меньше
  частиц.
- **Движок.** Шаг считается по реальному времени кадра (на 120 Гц не быстрее,
  чем на 60). На узком экране частиц ×0.6. Сохраняются `pointer-events:
none`, reduced motion (эффект не рисуется) и пауза в скрытой вкладке.
- **Украшение шапки — корень бага «включено, но не видно».** Ассет
  Хэллоуина (проверен на CDN-хосте: 2728×146, 4,3 КБ, отдаётся с 200) — тёмные
  силуэты (~`#2b2b2b`) на прозрачном фоне. На тёмной шапке «Полдня»
  (`rgb(31,31,29)`) они почти не видны. Монохромные ассеты помечаются
  `tint: true` и рисуются CSS-маской цвета темы (`rgb(var(--foreground) /
0.55)`) — читаются в Dark и Light. Цветные ассеты — как есть.
- **Украшение шапки** проверяет ассет загрузкой (`data-state`: loading,
  loaded, error):
  - на сайте при ошибке полосы нет, в dev-консоли — предупреждение;
  - в превью админки — явное «Ассет украшения не загрузился» с адресом;
  - не зависит от флагов эффекта, «o» и баннеров.

**Consequences.** С машины разработки `cdn-files.twomc.su` недоступен: DNS
отдаёт fake-IP `198.18.x`, TLS-соединение рвётся — браузер и сервер Next не
получают ни украшение, ни другие ассеты CDN. На самом хосте CDN исправен
(nginx отдаёт файлы с 200, вчерашние запросы с другого адреса проходили) —
это локальная сеть/прокси, не код и не конфигурация сервера (R24). Флага
«Decorations» отдельно от украшения шапки нет: других сезонных украшений в
продукте нет — флаг появится вместе с функцией.

## ADR-0091 — Профиль B5: handle, просмотры, реакции, привязки, соцсети, 3D-голова

**Decision.**

- **Handle профиля** (`resolveUserIdByHandle`): ник сайта → alias входа
  (`younaxo` → `younaxo_`) → ник привязанного Minecraft-аккаунта, без учёта
  регистра. Используется в публичном профиле, summary, реакциях, просмотрах и
  скинах. Владелец на странице определяется по id, а не по адресу.
- **Просмотры** (`POST /users/:handle/view`): только вошедшие; свой — не
  считается; одна запись на пару «профиль × зритель» (повтор обновляет
  время). Счётчик — уникальные зрители. Анонимные просмотры не считаются:
  надёжной дедупликации без аккаунта нет.
- **Реакции** (`PUT /users/:handle/reaction`, `LIKE` / `DISLIKE` / `null`):
  одна на пару, смена и снятие; свой профиль — 403. Скрытый профиль — 404 для
  просмотра и реакции.
- **Connected Accounts** — Discord/Telegram только из реальных привязок
  (`UserExternalAccount`): провайдер и имя, без внешних ID, с учётом
  `hideSocials`. В соцсетях профиля Discord/Telegram больше нет (ни в
  редакторе, ни в публичном ответе).
- **Соцсети:** + `GITHUB`, `WEBSITE` (миграция enum только добавляет
  значения). Сайт — только `https://`; GitHub — ник (→
  `https://github.com/<ник>`) или ссылка `github.com`.
- **Web:**
  - 3D-голова рядом с аватаром — CSS-куб из текстуры скина (ADR-0089), без
    WebGL; при наведении поворот (не при reduced motion); без скина не
    показывается;
  - круглая кнопка «Редактировать профиль» в правом верхнем углу баннера,
    иконка поворачивается на hover и focus;
  - просмотры и лайк/дизлайк (своё и анонимное — недоступно с пояснением);
  - блоки «Привязанные аккаунты» и «Соцсети» — официальные знаки Simple
    Icons, у сайта — нейтральная иконка.

## ADR-0092 — Auth: spotlight регистрации, форматы кодов Minecraft, восстановление по нику, Emoji

**Decision.**

- **Spotlight (A11).** При входе в регистрацию (смена маршрута на
  `/register`, один раз за вкладку) — сплошное затемнение (без blur) и
  coachmark (production Popover, привязан к реальной кнопке через
  `PopoverAnchor`) «Впервые здесь?» с кнопками [Как зарегистрироваться]
  [Мне понятно]. Подсвеченная кнопка — над затемнением и нажимается.
  Escape, клик вне подсказки и «Мне понятно» закрывают её. Tutorial сам больше
  не открывается. На «Вход» spotlight нет.
- **Коды Minecraft (A12).** Код привязки `XXX-000-X0X0-0X0` (13 значимых + 3
  дефиса = 16), код подтверждения `X0XX0`. `X` — A–Z, `0` — 0–9.
  - Генерация только на сервере (`code-format.ts`, `randomInt`), хеш — от
    значимых символов; проверка по шаблону. Остальное прежнее: one-time,
    TTL, лимиты.
  - Web повторяет правила для ввода: `LinkCodeInput` — верхний регистр,
    символы своей позиции, автодефисы, нормализация вставки; `OtpInput
pattern="X0XX0"` — ячейки буква/цифра.
  - Tutorial: длина в названиях шагов, на шагах 3 и 5 — «Пример формата» с
    шаблоном, а не выдуманным кодом.
- **Восстановление по нику (A13).**
  - `POST /auth/forgot-password/lookup` (капча, 5/мин): ник, alias или
    Minecraft-ник → строгая маска e-mail `y***o@i*****.com` (строит сервер) и
    привязанные провайдеры без имён и ID.
  - `POST /auth/forgot-password` с `username`: ссылка уходит, только если
    введённый полный e-mail (trim + нижний регистр) совпал с адресом
    аккаунта; ответ всегда одинаковый, 5/мин.
  - Токен — прежний: 32 случайных байта, хранится sha256, одноразовый, с TTL,
    старые токены удаляются. Системные аккаунты не находятся.
- **Провайдеры (A14)** — только для привязанных: disabled-плитки «Сброс
  через Discord/Telegram — Скоро». Механизма сброса нет — и рабочей кнопка не
  выглядит.
- **«← Вернуться ко входу» (A16)** — `ArrowLeft`, сдвиг на hover и фокусе, без
  движения при reduced motion.
- **Apple Emoji (A15).** Центральный реестр `EMOJI` и `<Emoji name>`: картинка
  только из разрешённого пака `NEXT_PUBLIC_EMOJI_PACK_URL`; без пака
  системный emoji не рисуется (только подпись). В UI emoji сейчас нет
  (guard ADR-0085). Пак Apple-style — 🚫 лицензия (RISKS R25).

## ADR-0093 — Профиль: метрики, статус, привязки; Mini Profile; loading кнопок

**Decision.**

- **Шапка `/u/…` (`ProfileHero`).** На баннере слева сверху — круглая
  «Редактировать» (только владелец; отдельного права staff на редактирование
  чужого профиля в RBAC нет — не выдумываем), справа сверху —
  `ProfileMetrics`: один solid-контейнер «просмотры · нравится · не нравится».
  Просмотры — только показатель; свой профиль — счётчики без кнопок; гость —
  недоступные кнопки с подсказкой. Ниже — аватар с 3D-головой, префикс роли
  (`xs`), ник, статус (одна строка, многоточие, полный текст в `title`),
  бейджи. Правый нижний угол — `ProfileAwardsSlot`: пустой, пока нет системы
  наград (без заглушек).
- **Статус — один источник** `User.statusText`. Причины «не виден»: после
  сохранения `useUpdateProfile` не обновлял кэш публичного профиля и summary
  (до минуты старые данные) — теперь инвалидирует `['profile','public']` и
  `['profile','summary']`; в summary статуса не было вовсе — теперь
  `statusText` есть и показывается в mini profile и превью.
- **Привязанные аккаунты.** URL строит сервер только из реальной привязки
  (`connectedProfileUrl`): Telegram — `https://t.me/<username>` при валидном
  username; у Discord публичной страницы по нику нет — `url: null`, в UI
  «Скопировать имя». Внешние переходы — через общий `ExternalLinkGuard`.
- **Mini Profile.** Префикс роли `xs` (×2 от 7 px, целый масштаб — без мыла и
  искажений). Вместо «Друзья / Достижения» — «Баланс / Рубины» из `/wallet`
  (ADR-0094); ошибка — «—», не ноль. «Админ-панель» — отдельный блок между
  меню и «Выйти», только при `ADMIN_ENTRY_REQUIREMENT`; акцент — свой токен
  `admin` / `admin-soft` (не `destructive`: это не опасное действие).
- **Окна из шапки и плавающие кнопки.** Уведомления и mini profile выше по
  z-index, чем FAB (чат, корзина), и на невысоком экране накрывали их — снизу
  торчала срезанная дуга круглой кнопки. Теперь при открытии меряется зона
  FAB (`floatingClearance`) и передаётся в `collisionPadding.bottom`; в окне
  уведомлений прокручивается только список, mini profile прокручивается, а не
  обрезает «Выйти».
- **Loading кнопок: одна кнопка — один icon slot.** `Button` больше не
  добавляет второй спиннер. Есть иконка — анимируется она (по имени lucide:
  Refresh/Rotate — вращение, Upload — подъём, Download — опускание, Send —
  сдвиг, прочие — пульс); нет иконки — спиннер поверх прозрачного текста
  (ширина и имя кнопки сохраняются). Reduced motion — без анимации, только
  приглушение.

## ADR-0094 — Кошелёк: баланс только для чтения

**Context.** Mini profile показывает баланс и рубины, а кошелька в схеме не
было (ADR-0035/0036). Рубины — внутренняя валюта twomc.su (ROADMAP 6.0).

**Decision.** Агрегат `Wallet` (userId + валюта `RUB | RUBY`, `balance BigInt`
в минимальных единицах, `version` для будущей оптимистичной блокировки,
`CHECK balance >= 0`). Строки нет — баланс 0. `GET /wallet` (только свой):
`{ balances: [{ currency, amountMinor: string, scale }] }` — суммы строкой без
float. Операций пока нет: начисления, переводы рубинов, магазин и мини-игры
будут менять баланс только через журнал проводок в одной транзакции — контракт
`GET /wallet` при этом не меняется. Обратного обмена и вывода нет.

## ADR-0095 — Привязанные аккаунты: общий реестр провайдеров, VK и Steam, видимость

**Decision.**

- **Реестр** `auth/connected-providers.ts`: `discord | telegram | vk | steam`
  с единым контрактом — ключ, подпись, способ подтверждения владения
  (`integration`: oauth / widget / openid / null), публичная ссылка по данным
  привязки (`profileUrl`). Хранение — та же `UserExternalAccount` (внешний id,
  username, displayName) + новые `avatarUrl` и `isPublic` (аддитивная
  миграция). Google/GitHub позже — новая запись без смены контракта.
- **Ссылки только из привязки:** Telegram — `t.me/<username>`; VK —
  `vk.com/<screen_name>` или `vk.com/id<id>`; Steam —
  `steamcommunity.com/profiles/<SteamID64>`; Discord — нет (публичной
  страницы по нику нет). Внешний id в ответ не уходит, кроме того, что
  провайдер сам держит в адресе профиля (VK id, SteamID64).
- **VK и Steam без интеграции** (`integration: null`): `GET
/auth/social/providers` отдаёт `enabled: false`, в настройках — «Скоро»,
  привязать нельзя. Интеграции (VK ID OAuth, Steam OpenID) — отдельная задача:
  нужны приложение VK ID и Steam Web API key (🚫 владелец).
- **Видимость по провайдеру — на сервере:** `PATCH
/auth/linked-accounts/:provider { isPublic }` (аудит); скрытая привязка не
  попадает в публичный DTO вовсе. Общий `hideSocials` по-прежнему скрывает
  всё.
- **Ручные соцсети:** `PUT /users/me/social-links/{DISCORD|TELEGRAM|VK|STEAM}`
  → 400 — подтверждённую платформу нельзя «выдать» ссылкой; в настройках
  полей для них нет, в публичном профиле старые ручные значения не
  показываются (данные не удаляются).

## ADR-0096 — Реальные скриншоты TwoMC: реестр, CDN, Auth Showcase

**Context.** Владелец передал 8 реальных скриншотов сервера (1920×1009, PNG,
без EXIF/ICC/XMP и текстовых блоков, альфа полностью непрозрачная). Сайт
показывал вместо них логотип и заглушки.

**Decision.**

- **Реестр** `lib/site/project-screenshots.ts` — единственный источник: id
  (slug = каталог на CDN), title, description и alt (только видимое на
  кадре), category, priority (порядок показа), width/height, objectPosition
  (фокус кадрирования), исходный файл. URL в JSX не пишутся.
- **CDN:** `assets/images/screenshots/<id>/{640,960,1280,1600,1920}.{avif,webp}`
  - `original.png` (байт-в-байт). Без upscale (максимум — исходные 1920).
    AVIF q62 4:4:4 (не мылит цветной текст голограмм), WebP q84 smartSubsample.
    Итого на 8 кадров: PNG 30,4 МБ → все производные AVIF 2,9 МБ / WebP 4,1 МБ;
    кадр 1920 — AVIF 59–183 КБ. `NEXT_PUBLIC_SCREENSHOTS_BASE_URL` — база для
    локальной проверки (CDN недоступен из среды разработки, R24).
- **`ScreenshotPicture`** — `<picture>` AVIF/WebP + `sizes`, intrinsic
  width/height (без CLS), `priority` только над сгибом, остальные lazy; ошибка
  загрузки — нейтральная поверхность с названием. Без blur/фильтров.
- **`ScreenshotCarousel`** (Auth и design-lab): только кадр и управление
  поверх него — без заголовков, подписей и логотипа (что на кадре — в alt и
  sr-only). Fade 400 мс, автопрокрутка 6 с; пауза — наведение, фокус, фоновая
  вкладка, кнопка; после ручного действия — 12 с; точки слева, пауза/← →
  справа на solid-плашке, лёгкий градиент только под ними; ← → / свайп /
  клавиатура; reduced motion — без автопрокрутки и анимаций. Загружаются
  текущий и следующий кадр, остальные — по мере показа; у скрытого варианта
  приоритета нет.
- **Auth Showcase** (`AuthVisual`, один компонент для входа, регистрации,
  восстановления и сброса): вся правая половина панели — один full-bleed
  кадр (object-cover + objectPosition кадра, радиус — от самой панели), кнопка
  «развернуть» справа сверху → `ScreenshotViewer` (production Dialog: contain,
  ← →, свайп, Escape). При cover в узкой высокой половине кадр рисуется шириной
  ≈1100–1500 px — `sizes` 1600px (DPR 1 → файл 1600, DPR 2 → исходные 1920).
  Mobile — кадр 16:6 с точками, форма остаётся главной.
- **Сайт без повторов:** hero главной — «Спавн TwoMC» (priority) + «Спавн
  ночью»; «3D-казино» — карточка showcase (кадр `2026-10-10_13.28.43.png`) и
  второй слайд Auth; галерея «Как выглядит twomc.su» — остальные 5 кадров.
  Слоты скриншотов tutorial регистрации не заполняются: на кадрах нет шагов
  `/site-connect`.

## ADR-0097 — Системные уведомления (Web Push), звук и уведомления при открытом сайте

**Context.** О новых личных сообщениях человек должен узнавать и когда вкладка
TwoMC в фоне или браузер свёрнут (в Windows — центр уведомлений), и когда сайт
открыт. При этом без дублей (push + тост + звук об одном и том же), без
навязчивых запросов разрешения и без утечки текста сообщений в push-сервисы
браузеров, если человек этого не хочет.

**Decision.**

- **Одно правило доставки** (`notifications/push-policy.ts` + клиентский
  `lib/notifications/in-app.ts`):
  - есть видимая вкладка сайта (`presence:visibility` по сокету
    `/notifications`) — системный push не отправляется; в интерфейсе — тост и
    звук, а если открыт этот же диалог — только тихий звук, без тоста;
  - вкладок нет или все в фоне — системный push, в интерфейсе ничего;
  - свои сообщения, выключенный тип «Сообщения», тихие часы — ничего;
  - один `notification.id` — не больше одного push (`sentViaPush`), одного
    тоста и одного звука; `tag` `msg:<conversationId>` схлопывает уведомления
    одного диалога в системе.
- **Payload без утечек.** Предпросмотр выключен — сервер не кладёт в push ни
  имя отправителя, ни текст («TwoMC» · «Новое сообщение»). Включён — «TwoMC ·
  ник» и начало текста до 120 символов. URL — только внутренний путь; ссылки
  на диалоги ведут в Центр уведомлений, пока раздел «Сообщения» не выпущен
  (`MESSAGES_ROUTE_AVAILABLE`).
- **Разрешение браузера — только по нажатию.** Подсказка у колокольчика (по
  образцу spotlight регистрации, очередь onboarding: регистрация важнее)
  появляется через 6 с на сайте, если разрешение ещё не запрошено, push
  настроен на сервере и не открыт другой диалог. «Не сейчас» — 14 дней
  тишины; закрыть окно браузера без решения — 3 дня; заблокировано —
  инструкция «Как включить», повторных запросов нет.
- **Подписка — устройство, а не аккаунт.** Upsert по endpoint (вход другим
  аккаунтом перепривязывает подписку); выход из аккаунта сначала отписывает
  этот браузер на сервере и в PushManager. «Настройки → Уведомления»: свой
  переключатель для этого устройства, список устройств с удалением,
  «Сообщения», звук, предпросмотр, уведомления при открытом сайте.
- **Service Worker.** Production — полный `sw.js`; вне production —
  `sw.js?mode=push` без кэширования (только push и клик). Клик по системному
  уведомлению фокусирует уже открытую вкладку и переходит через
  `twomc:navigate` только по внутреннему пути.
- **Звук** — единый сервис `notificationSound` со своим синтезированным
  сигналом `notification-message.wav` (~0,5 с, громкость 0,35 / тихий 0,15),
  готовится после первого жеста (autoplay-политика). В фоне звук системного
  уведомления задают браузер и ОС — свой файл туда не подставляется.
- **VAPID.** Публичный ключ — `GET /notifications/push/vapid-key`; приватный —
  только в серверном env (`VAPID_PRIVATE_KEY`), в Git не попадает. Без ключей
  `configured: false`: подсказка не показывается, в настройках честное
  «пока не настроены».

**Consequences.** Учёт видимых вкладок живёт в памяти одного процесса API —
при нескольких инстансах нужен общий стор (R27). Production-ключи VAPID
задаёт владелец при деплое. Переход из push прямо в диалог появится вместе с
разделом «Сообщения».

## ADR-0098 — Ассеты TwoMC на CDN: реестры префиксов и валют, один префикс возле ника

**Context.** Владелец передал официальные ассеты resource pack: иконки валют (монета, рубин —
16×16), медиа-префиксы (4) и донат-префиксы (7) — pixel-art высотой 7 px, как префиксы ролей.
Скриншоты сервера (ADR-0096) ждали загрузки на CDN (R26). В Mini Profile у «Рубины» стоял
generic lucide `Gem` (он же значок «Подписчик+»), у «Баланс» иконки не было.

**Decision.**

- **CDN — существующая структура, без дублей.** Медиа- и донат-префиксы — рядом со
  staff-префиксами: `minecraft/resourspack/prefixes/{media,donations}/`; валюты —
  `minecraft/resourspack/currencies/`; скриншоты — `assets/images/screenshots/<id>/`.
  Историческая опечатка `resourspack` — production-контракт, не переименовывается. Донат-префиксы
  уже лежали на CDN байт-в-байт как у владельца — не перезаливались. Загружены PNG как есть (в
  файлах только цветовые чанки, без текстовых метаданных); AVIF/WebP для pixel-art 16 px не
  нужны — PNG меньше и без потерь. Манифест — `docs/technical/26-CDN-FILES.md`.
- **Реестр префиксов** (`packages/shared/src/role-prefixes.ts`): категории STAFF / MEDIA /
  DONATION, slug, имя, ширина (высота всегда 7 px), путь по категории. Медиа: одна площадка
  (`MediaBadgeKind`) — её префикс, несколько или неизвестная — общий `media`. Донат — только
  ассеты: уровней доната и выдачи привилегий нет (этап Donation не начат).
- **Один префикс возле ника** — `resolvePrimaryPrefix`: STAFF (основная роль с префиксом) >
  MEDIA > DONATION. Несколько префиксов подряд не выводятся; остальные статусы — значками.
  `RolePrefix` рисует префикс любой категории (целый масштаб, pixelated), тултип называет вид:
  «Роль команды» / «Медиа-партнёр» / «Привилегия». Подключено в `UserIdentity` (mini profile,
  превью) и шапке профиля.
- **Реестр валют** (`packages/shared/src/currency-assets.ts`): MONEY и RUBY — путь, 16×16,
  подпись, alt; валюта кошелька → иконка (RUB → монета, RUBY → рубин). `<CurrencyIcon />` —
  целый масштаб ×1/×2/×3, pixelated, декоративная рядом с подписью; не загрузилась — не рисуется.
  Используется везде, где показывается кошелёк (сейчас — Mini Profile). Цены магазина — оплата
  деньгами (₽ текстом), это не кошелёк, иконки там нет.
- **Иконки уровней** (Level System не начата): на CDN `assets/images/level/` уже 70 файлов, но
  по содержимому они отличаются от официальных из resource pack — зафиксировано в
  `docs/levels/REQUIREMENTS.md`, сейчас ничего не меняется.

**Consequences.** Новые ассеты подключаются строкой в реестре, не `<img>` в компонентах. Когда
появятся донат-привилегии, донат-префикс встанет в тот же слот по приоритету.

## ADR-0099 — Публичная identity `ник#0000`: числовой discriminator, одна строка, Mini Profile

**Context.** Владелец: identity везде — `[PREFIX] ник` одной строкой (не префикс над ником),
в Mini Profile — `[PREFIX] ник#0000` без внутренних номеров («ID 2»), статуса и повторов ника;
префикс в Mini Profile заметно меньше (~×1.5); тултип префикса появлялся далеко от него;
выход — только после подтверждения; сезонное украшение шапки — и над профилем, и над Mini
Profile. Тег был `name#4a2b` (hex) у обычных аккаунтов и `name#0002` у bootstrap.

**Decision.**

- **Discriminator** — новое поле `User.discriminator` (SMALLINT, CHECK 0–9999): выдаёт только
  backend при регистрации (`crypto.randomInt`), дальше не меняется; не DB ID и не shortId.
  `tag` хранится как `username#DDDD` (ник уникален и неизменяем — тег уникален без перебора).
  Миграция `20261010110000_user_discriminator` без слепой регенерации: суффикс из 4 цифр
  (bootstrap `younaxo_#0002`) сохраняется; hex-суффикс → число hex по модулю 10000; иное →
  детерминированный хеш id. Прежний тег — в `legacyTag`. Тег не участвует в URL и маршрутах
  (профиль — по нику/алиасу/Minecraft-нику), поиск по тегу продолжает работать. API отдаёт
  `discriminator` строкой из 4 цифр в `/auth/me`, summary, своём и публичном профиле.
- **`UserIdentity`** — всегда одна строка `flex-nowrap`: префикс (один, ADR-0098) + ник +
  `#0000`. Места мало — сначала ник обрезается многоточием (до ~4.5rem), затем префикс
  пропорционально ужимается (≤ 60%); discriminator виден всегда; без нативного `title`.
  Вариант «префикс над ником» удалён. Шапка профиля — та же схема (ник остаётся `h1`).
- **Тултип префикса.** Причина: триггер растягивался колонкой flex, а `self-start` попадал на
  внутренний элемент — Radix центрировал тултип по пустому месту. Теперь `className`/props —
  на внешнем элементе (триггере), у триггера `w-fit`; координаты не задаются вручную.
- **Префикс `compact`** (Mini Profile) — около ×1.5: масштаб подбирается под DPR так, чтобы
  пиксель исходника был целым числом физических пикселей (`crispScale`: DPR 1.25 → ×1.6,
  1.5 → ×1.33, 2 → ×1.5). На DPR 1 ближайший целый вариант — прежние ×2 (крупно), поэтому
  остаётся ×1.5 с `image-rendering: pixelated` — без размытия, пиксели чуть неравные.
- **Mini Profile**: баннер + сезонное украшение (тот же `SeasonalHeaderDecoration`, флаг и
  ассет, что у шапки сайта) → аватар и 3D-голова → `[PREFIX] ник#0000` → присутствие →
  кошелёк → меню → admin-блок → «Выйти». Без статуса, номеров, бейджей и повторов ника.
  Превью по нику — без «ID», статус до двух строк.
- **Выход** — одна политика `useLogoutConfirm` во всех местах (Mini Profile popover и sheet,
  меню админки, экран «нет доступа»): наш `ConfirmDialog` «Выйти из аккаунта?» (Escape, ловушка
  и возврат фокуса), без `window.confirm`.

**Consequences.** Новые аккаунты сразу получают `ник#DDDD`; старые hex-теги заменены
детерминированно и сохранены в `legacyTag`. Чат, комментарии, друзья и лидерборды получат
одну строку identity автоматически, используя `UserIdentity`.

## ADR-0100 — Профиль: «О себе» (безопасный Markdown), «Информация», «Награды и значки»

**Context.** В «О себе» смешивались bio, город, день рождения, пол и «На twomc.su с …» (дата ещё
и дублировалась в карточке «Игрок»). День рождения чужим не показывался никогда: `applyPrivacy`
отдавал дату, но не флаг `showBirthDate`, а веб проверял именно его. Владелец: bio — с
Markdown, метаданные — отдельно, в «Игрок» — большая витрина наград и значков без фейков.

**Decision.**

- **Bio — свой безопасный Markdown** (`SafeMarkdown`): разбор прямо в React-узлы, никакого
  HTML-вывода и `dangerouslySetInnerHTML` — `<script>`, `<iframe>`, `style`, обработчики и любой
  HTML остаются текстом. Поддержано: абзацы и переносы, жирный, курсив, зачёркнутый, код,
  ссылки (markdown и голые https), списки, цитаты, экранирование. Намеренно нет: картинок
  (нет безопасной медиа-архитектуры), заголовков (не «ломают» профиль), таблиц. Ссылки — только
  http/https/mailto (javascript:, data:, vbscript:, относительные — текст), с
  `rel="nofollow ugc noopener noreferrer"`; переход — через подтверждение ExternalLinkGuard.
  Вложенность форматирования ограничена. Лимит bio — прежние 500 символов. Без новых
  зависимостей.
- **«Информация»** (`ProfileInfoSection`): город, день рождения, пол (SVG lucide Mars / Venus /
  NonBinary; «не указывать» не показывается), «На twomc.su с …» — один раз (в карточке «Игрок»
  дата больше не дублируется).
- **День рождения — нормализованный контракт**: публичный профиль отдаёт
  `birthday: { day, month, year | null }` вместо `birthDate`; скрыт (`hideBirthDate`, по
  умолчанию) — поля нет; `showBirthDate` — с годом. Клиенту не нужно знать флаги приватности.
  Свой профиль-как-видят-другие — в том же виде (и discriminator строкой).
- **«Награды и значки»** (`GET /users/:username/showcase`, `ProfileShowcase`): активные награды
  пользователя (`UserAward.order`) и выставленные им завершённые достижения
  (`UserAchievement.isShowcased`, `showcaseOrder`) + значки (системные, медиа, украшение) из
  summary. Наружу — только отображаемые поля (без условий и наград за достижения); скрытый
  профиль — 404. Плитки с подсказкой (название, описание, редкость, дата), рамка по редкости;
  пусто — «Пока нет наград и значков». Значки под ником в шапке страницы профиля убраны — они в
  витрине. Миграции не нужны.
- **Мелочи**: «Редактировать» — без вращения: ×1.03, акцентная поверхность, лёгкий наклон и
  подъём карандаша за 200 мс, reduced motion — только цвет. Свои лайки/дизлайки — недоступная
  кнопка (`aria-disabled`, not-allowed) с нашим Tooltip «Нельзя оценить собственный профиль».

**Consequences.** Полный список наград и переход к достижению — позже, на тех же плитках.

## ADR-0101 — Привязанные аккаунты: ссылки на профили провайдеров и одна карточка с состояниями

**Context.** В публичном профиле у Discord вместо ссылки была только «Скопировать имя» (ссылку
специально не строили), а настройки привязок были списком текстовых строк. Владелец: каждый
привязанный аккаунт — ссылка на реальный профиль, где это возможно; Discord — по внешнему id,
не по нику; настройки — карточки «иконка/аватар, статус, Открыть профиль, Скрыть/Показать,
Отвязать» в шести состояниях; Google и GitHub — не сейчас.

**Decision.**

- **Ссылки — только из реестра и реальной привязки** (`connected-providers.ts`): Discord —
  `https://discord.com/users/<snowflake>` (id 17–20 цифр; ник в адрес не подставляется),
  Telegram — `t.me/<ник>` только при публичном нике (нет ника — ссылки нет, без выдумок), VK —
  по screen_name или `id<n>`, Steam — по SteamID64. Публичный профиль отдаёт готовую `url`, свои
  привязки (`GET /auth/linked-accounts`) — `profileUrl`; сам внешний id наружу не уходит.
- **Публичный профиль**: ссылка у всех, у кого она есть; «Скопировать имя» у Discord —
  дополнение рядом со ссылкой, не замена. Переходы — через ExternalLinkGuard.
- **`ConnectedAccountCard`** — один компонент для всех провайдеров: иконка или аватар
  аккаунта с эмблемой сервиса, статус, имя, даты; действия «Открыть профиль» (нет публичной
  страницы — недоступно с подсказкой), «Показывать в профиле», «Отвязать» (с подтверждением);
  для непривязанного — «Подключить», для VK/Steam — «Скоро». Состояния: не привязан, привязан,
  скрыт, ошибка (реальная — не удалось начать привязку: причина и «Повторить»), требуется
  повторная авторизация («Войти заново»), скоро.
- **«Требуется повторная авторизация»** на сайте сейчас не возникает: токены провайдеров не
  хранятся, источника нет — состояние есть в компоненте и Design Lab, но не выдумывается.
  Поле статуса привязки в БД добавим вместе с реальным источником.
- **Google / GitHub** не добавлены: реестр позволяет добавить их записью без смены контракта.

**Consequences.** Миграций нет; контракт свой привязок дополнен полем `profileUrl`.

## ADR-0102 — Иконка сайта в подтверждении внешнего перехода, резолвер с защитой от SSRF

**Context.** Модалка «Вы переходите на внешний сайт» показывала только домен и адрес. Владелец:
показать иконку сайта; для известных сервисов — официальные иконки, для произвольного сайта —
безопасный резолвер (http/https, проверка DNS/IP, запрет localhost и частных сетей, проверка
redirect, только картинки, лимит размера, таймаут, кэш), без внешнего favicon-сервиса, которому
утекал бы адрес пользователя; нет иконки — Globe.

**Decision.**

- **Известные сервисы — без сети** (`lib/site/site-icon.ts`): Discord, Telegram, VK, Steam,
  Twitch, YouTube, TikTok, GitHub (добавлен в BrandIcon), Instagram, X, Facebook — по домену и
  поддоменам (`notdiscord.com`, `discord.com.evil.ru` не совпадают).
- **Произвольный сайт — `GET /link-preview/favicon?url=`** (модуль `link-preview`): в резолвер
  уходит только origin (без пути и параметров), запрос без referrer. Сервер берёт только
  `/favicon.ico` (HTML чужой страницы не разбирается).
  - URL: только http/https, стандартные порты, без логина/пароля, не `localhost`/`*.localhost`,
    не однословные и внутренние зоны (.local/.internal/.lan/…).
  - **Адрес проверяется в момент соединения** (свой `lookup` для http/https): все IP, в которые
    резолвится хост, должны быть публичными (`ip-guard.ts`: loopback, 0/8, частные, CGNAT,
    link-local и метаданные облака, TEST-NET, 198.18/15, multicast, reserved, IPv6 ::1/ULA/
    link-local/multicast/doc/6to4/Teredo, IPv4-mapped и NAT64 — по правилам IPv4) — это
    закрывает и DNS-rebinding; IP-литералы проверяются так же.
  - Redirect — вручную, ≤ 3, каждый — заново через все проверки.
  - Таймаут 3 с, ответ ≤ 64 КБ (по заголовку и по потоку), формат — только по сигнатуре байтов
    (ICO/PNG/GIF/JPEG/WebP; SVG не принимается).
  - Кэш Redis по хосту: иконка — сутки, «иконки нет» — 6 ч. Ограничение частоты 30/мин.
  - Ответ: Content-Type по сигнатуре, `nosniff`, `CSP: default-src 'none'`, CORP cross-origin.
- **`SiteIcon`** в модалке: brand-иконка / фавиконка / Globe (пока грузится и при ошибке);
  подтверждение перехода работает в любом случае.

**Consequences.** Живую загрузку фавиконки нужно проверить в среде с настоящим DNS: машина
разработки резолвит внешние хосты в fake-IP прокси (198.18/15, R24) — резолвер их правильно
блокирует, поэтому локально видна Globe.

## ADR-0103 — Без системных подсказок браузера; исправление углов списка /notifications

**Context.** (1) В нескольких местах при наведении появлялась серая системная подсказка браузера
(`title=""`) поверх интерфейса «Полдня». (2) На `/notifications` у нижних углов списка
оставались «тупые» квадратные углы; прежнее исправление касалось только окна колокольчика.

**Decision.**

- **Аудит `title=""`** — 12 мест в DOM. Убраны вместе с переделкой identity (ADR-0099): статус
  в шапке и превью, ник и тег в `UserIdentity`. Здесь — остальные: «скоро» в футере (подпись и
  так видна — подсказка не нужна), логотипы оплаты и превью соцсетей в админке (наш Tooltip +
  `sr-only` подпись у иконки), иконки баннера в админке (Tooltip, подпись уже в `aria-label`),
  должность в списке пользователей админки (Tooltip к обрезанному бейджу), должность в превью
  профиля (видна целиком, до двух строк). Браузерные контролы `input type=time/range`,
  `<details>` и скрытые `input type=file` оставлены: это части формы с нативной доступностью,
  а не подсказки поверх нашего UI. Регрессия — тест «нет нативных title».
- **`/notifications` — причина подтверждена в DOM/CSS**: секция `rounded-xl` (20 px) без
  внутренних отступов, список — вплотную к её нижнему краю, у последней строки фон
  (непрочитанное `bg-primary-soft/30` или наведение) с радиусом 0 → квадратные углы выступали
  за скругление. Плюс подсветка наведения была только у ссылки и не покрывала колонку кнопок.
  Исправление: фон непрочитанного и наведения — на всей строке; у последней строки —
  `rounded-b-xl`, как у секции (когда ниже нет «Показать ещё»). Без `overflow-hidden` —
  фокус-рамка ссылки не обрезается.

## ADR-0104 — CORS: явный allowlist origin'ов для API и Socket.IO

**Context.** Финальный аудит пакета: CORS был задан одним `WEB_ORIGIN` (без wildcard), но для
production нужны `https://twomc.su` и реально используемые официальные поддомены, а Socket.IO
должен разрешать ровно те же origin'ы.

**Decision.** `config/cors.ts`: `WEB_ORIGINS` — явный список через запятую (пусто — `WEB_ORIGIN`),
нормализация до origin, без дублей. `*` и шаблоны (`https://*.twomc.su`) — ошибка конфигурации
при старте; в production — только https (кроме явного localhost для smoke). Проверка — точное
совпадение (`https://twomc.su.evil.com`, `http://twomc.su`, `null` — отказ, без
`Access-Control-Allow-Origin`), credentials — только своим. Один allowlist для HTTP
(`configure-app.ts`) и Socket.IO (`websocket-adapter.ts`). Запросы без `Origin` (тот же сайт,
сервер-сервер) — не CORS и проходят как раньше.

**Also (финальный QA).** На телефонах 360 px шапка выходила за край на 8 px (меню, логотип,
счётчик онлайна, колокольчик и профиль не помещались) — ниже 380 px скрыт второстепенный
счётчик онлайна; логотип не меняется.

## ADR-0105 — Сессии: «это устройство», завершить остальные, смена пароля отзывает другие

**Context.** Срез 1.2 roadmap волн: в «Настройки → Безопасность» не было видно, какая сессия
текущая; «Завершить» можно было нажать у собственной; смена пароля не разлогинивала другие
устройства; аккаунт с `mustChangePassword` мог пользоваться сайтом, не сменив пароль.

**Decision.**

- Access-токен несёт `sid` — id refresh-сессии этого устройства (`issueTokenPair` сначала
  создаёт сессию, потом подписывает токен); `AuthenticatedUser.sessionId`. Права по-прежнему
  из БД — `sid` только для идентификации устройства.
- `GET /auth/sessions` — флаг `current`; `DELETE /auth/sessions/:id` своей сессии — 400
  («используйте «Выйти»»); новый `DELETE /auth/sessions/others` — завершить все, кроме
  текущей; `POST /auth/change-password` отзывает все остальные сессии, текущая остаётся.
- Web: бейдж «Это устройство», у текущей нет «Завершить», кнопка «Завершить все остальные»
  (+ прежнее «Выйти на всех устройствах» с подтверждением). Аккаунт с `mustChangePassword` с
  любой страницы сайта попадает на `/settings/security` с пояснением; после смены флаг
  снимается сразу, цикла нет.
- **Отложено:** SYSTEM-уведомление «Пароль изменён» — `NotificationsModule` уже импортирует
  `AuthModule`, обратная зависимость дала бы цикл; сделать через событие/очередь, когда
  появятся фоновые задачи (PHASE 29).

**Consequences.** Старые access-токены без `sid` (до деплоя) работают, флаг `current` у них
не выставляется до ближайшего refresh (≤ 15 мин).

## ADR-0106 — Публичный профиль: скрытое состояние, жалоба, редирект `/users/*`

**Context.** Срез 1.3 roadmap волн. Видимость (`canView`: FRIENDS_ONLY — только принятым
друзьям, блокировка в любую сторону скрывает) уже была; но `GET /users/:username/public` для
скрытого профиля отвечал 404 — страница не отличала «закрыт приватностью» от «нет такого
игрока», хотя summary (ADR-0073) уже отдаёт `{ username, hidden: true }`. Жалобы на профиль
(`POST /users/:username/report`) были в API, но без UI и без связи с модулем «Жалобы и
обращения». Ссылки старого сайта `/users/<ник>` вели в 404; в превью не было «Открыть профиль».

**Decision.**

- `GET /users/:username/public`: скрытый профиль существующего игрока — 200
  `{ username, hidden: true }` (ровно эти поля), видимый — с `hidden: false`; 404 — только
  несуществующий ник. Существование ника и так видно по summary, нового раскрытия нет.
- Web `/u/[username]`: отдельные состояния «Профиль <ник> скрыт» (без данных и действий) и
  «Профиль не найден».
- «Пожаловаться» — круглая кнопка в левом верхнем углу баннера (там же, где у владельца
  «Редактировать»): только вошедшим, не на себя, только при `modules.reports`. Окно: причина
  (5 значений enum `ProfileReportReason`, контракт в `@twomc/shared`) обязательна, «Другое» —
  с описанием (≤ 1000); ошибка — у того контрола, который нужно исправить. Повторная жалоба
  обновляет прежнюю (upsert по паре). `POST /users/:username/report` помечен
  `@SiteModule('reports')` — выключенный модуль жалоб → 503.
- Превью профиля (hover card / sheet) — кнопка «Открыть профиль» → `/u/<ник>`, закрывает
  превью; на самой странице профиля и у скрытого профиля её нет.
- `next.config` redirects: `/users/:username` → `/u/:username` (308). У старого сайта других
  `/users/*` страниц не было.
- Метаданные: заголовок вкладки по решению владельца всегда «twomc.su», поэтому ник — только в
  description / Open Graph (`layout.tsx`). Данные профиля сервер не рендерит (клиентская
  страница), приватное в HTML не попадает — отдельный `noindex` для скрытых не нужен.

**Consequences.** «В друзья» и «Написать» на профиле — в волне 2 (2.1, 2.4). Если модуль
«Профили» выключен, а «Жалобы» включены, жалоба формально доступна, но страницы профиля нет
(503) — кнопку увидеть негде.

## ADR-0107 — Публичные ответы: только безопасные поля пользователя

**Context.** Найдено при подготовке среза 2.1: публичные эндпоинты возвращали связанных
пользователей через `include: { author: true }` (и `user` / `sender` / `createdBy`). Глобальный
Prisma `omit` скрывает только хеш пароля, поэтому в ответы уходили email, IP последнего входа,
причина бана, дата рождения, уровень доступа и флаги приватности. Затронуты: новости (`/news*`,
автор), события (`/events*`, создатель), комментарии профиля, общий чат, лента активности,
личные сообщения (участники и отправитель). e2e на прежнем коде это подтвердил.

**Decision.**

- Один источник безопасных полей — `PUBLIC_USER_SELECT` (`modules/users/public-user.ts`):
  `id`, `username`, `tag`, `avatar`. В перечисленных сервисах связи выбираются только через
  него: `include: { author: { select: PUBLIC_USER_SELECT } }`.
- Регрессионный e2e `public-user-fields.e2e-spec.ts`: в ответах новостей, событий и
  комментариев нет email пользователя и ключей `email`, `lastLoginIp`, `banReason`,
  `birthDate`, `accessLevel` и др.
- Друзья (`/friends*`, тот же класс проблемы) — в срезе 2.1 вместе с DTO списков.
- Админские сервисы (модерация, заявки, заказы в админке) не менялись: они закрыты правами
  доступа, и часть их экранов использует email. Сузить их поля — отдельной задачей.

**Consequences.** Для новых публичных ответов со связанным пользователем — только
`PUBLIC_USER_SELECT` или явный `select`. Код, которому нужны другие поля, читает их отдельным
запросом. Если эта версия уже была в production, email и IP авторов новостей и событий,
комментаторов и участников чата могли быть видны любому посетителю; рекомендация — сообщить
владельцу (ротация секретов не требуется: хеши паролей не утекали).

## ADR-0108 — Друзья и блокировки: безопасные ответы, ответная блокировка, страница `/friends`

**Context.** Срез 2.1 roadmap волн. API друзей было, UI — нет. Аудит перед UI нашёл:
списки `/friends`, `/friends/requests/*`, `/friends/blocked` отдавали полные строки `User`
(email, IP входа, причина бана… — тот же класс проблемы, что ADR-0107); через исходящую заявку
любой игрок видел email адресата. `POST /friends/block/:id` удалял любую связь между игроками —
в том числе чужую блокировку: заблокированный мог снять её, заблокировав в ответ. Блокировка
несуществующего id падала 500. Уведомления вели на старый `/users/<ник>`.

**Decision.**

- Ответы: `FriendDto { user, since }`, `FriendRequestDto { id, createdAt, user }`,
  `BlockedUserDto { user, blockedAt }`; `user` — только `id/username/tag/avatar`
  (`PUBLIC_USER_SELECT`, аватар через `StorageService.publicUrl`). Контракт — `@twomc/shared`
  `api/friends.ts`; API держит зеркальные интерфейсы (не импортирует shared).
- Блокировка не трогает чужой блок: снимает дружбу/заявки, добавляет свой блок рядом
  (уникальна упорядоченная пара); повтор — без изменений; неизвестный игрок — 404.
- `GET /friends/relation/:username` (ник, alias, Minecraft-ник) →
  `SELF | NONE | FRIENDS | OUTGOING | INCOMING | BLOCKED` + `requestId`. Чужая блокировка не
  раскрывается (`NONE`; профиль и так скрыт).
- Уведомления: заявка → `/friends?tab=incoming`, принятие → `/u/<ник>`.
- Web: `/friends` — вкладки «Друзья», «Входящие» (счётчик), «Исходящие», «Заблокированные»,
  вкладка в адресе. На `/u/[username]` — `FriendButton` (вошедшему, не на себе, при модуле
  «Друзья»): основное действие сразу, «Удалить из друзей» / «Заблокировать» — в меню «⋯» и
  только через `ConfirmDialog`. Ошибки политики заявок — текстом сервера. После действия
  состояние кнопки меняется сразу (без мигания и повторной заявки). Mini profile: «Друзья» →
  `/friends` со счётчиком входящих; WS `notification:changed` сбрасывает кэш друзей.

**Consequences.** Существующие пары, где блок был снят ответной блокировкой до этого
исправления, не восстанавливаются (данных о снятом блоке нет). «Написать» на профиле — в
срезе 2.4.

## ADR-0109 — Двухфакторная аутентификация (TOTP) и требование 2FA персоналу

**Context.** Срез 1.7 roadmap волн. `SiteSettings.requireAdmin2fa` существовал без механизма
(ADR-0050). Нужна 2FA для игроков и обязательная — для персонала по настройке.

**Decision.**

- TOTP по RFC 6238 (SHA1, 30 с, 6 цифр, окно ±1 шаг) на `crypto` без внешних зависимостей;
  проверка по векторам RFC. Один код не принимается дважды (`twoFactorLastStep`, атомарное
  условие в UPDATE — защита и от гонки двух входов).
- Секрет хранится зашифрованным AES-256-GCM; ключ — SHA-256 от `TWO_FACTOR_ENCRYPTION_KEY`
  (≥ 32 символов). Пустой ключ — 2FA недоступна (503 `two_factor_unavailable`, в настройках —
  «пока недоступна»). Секреты в глобальном Prisma `omit`. **Смена ключа делает включённую 2FA
  нерабочей** — менять только вместе со сбросом 2FA.
- 10 резервных кодов `xxxx-xxxx` (без похожих символов), одноразовые; в БД — HMAC-SHA256 с
  pepper из того же ключа. Новый набор — только по коду из приложения.
- API `/auth/2fa`: статус, `setup` (секрет + otpauth URI, «ожидающий» до подтверждения),
  `enable` (первый код → резервные коды один раз), `disable` (пароль + код или резервный код),
  `backup-codes`.
- Вход: при 2FA `POST /auth/login` после пароля отдаёт `{ twoFactorRequired: true }` и ставит
  httpOnly cookie `two_factor_challenge` (path `/auth`, 5 мин). Челлендж — в Redis (ключ — хеш
  id), ≤ 5 попыток, затем сгорает. `POST /auth/login/2fa { code }` выдаёт сессию. Неверный код
  — неудача входа для `BruteForceService` (блок IP после 10). Вход через Discord/Telegram при
  2FA — тот же шаг: callback ставит cookie и ведёт на `/auth/result?status=two_factor`.
- `requireAdmin2fa`: любое действие по праву (`@RequirePermissions` — админка, модерация) без
  включённой 2FA → 403 `admin_2fa_required`; web показывает «Нужна двухфакторная
  аутентификация» со ссылкой «Включить 2FA». Без ключа на сервере требование не применяется
  (иначе выполнить его невозможно). Флаг кэшируется на 15 с и сбрасывается при сохранении.
- Web: секция в «Настройки → Безопасность» (QR рисуется в браузере пакетом `qrcode` — секрет
  не уходит третьим сервисам; ручной ключ; `OtpInput`; окно резервных кодов с копированием и
  скачиванием, закрыть — только отметив «сохранил»); второй шаг входа на `/login` и
  `/auth/result`; `/auth/me` несёт `twoFactorEnabled`.

**Consequences.** Для production владелец задаёт `TWO_FACTOR_ENCRYPTION_KEY` в окружении API
(`openssl rand -base64 32`); до этого 2FA честно недоступна. Восстановление доступа без
телефона и резервных кодов — через администрацию (отдельной функции пока нет).

## ADR-0110 — Настройки уведомлений: типы, Discord, почта, сброс; безопасность каналов

**Context.** Срез 2.2 roadmap волн. API настроек было, UI — частично (push, звук, сообщения).
Аудит каналов перед UI нашёл:

- ответы `/notifications/settings*` отдавали строку целиком, включая URL личного
  Discord-вебхука с токеном (право писать в канал) и `userId`;
- отправка в Discord без `allowed_mentions` — чужой текст в уведомлении (комментарий,
  упоминание) мог пингануть `@everyone`/роли, в том числе в системные вебхуки проекта; без
  таймаута и лимита 2000 символов;
- письма (мгновенное и сводка) вставляли заголовок и текст уведомления в HTML без
  экранирования — HTML-инъекция в письме;
- `digest/test` без SMTP отвечал `sent: true` (ложный успех); тестовые отправки без лимита;
- режимы HOURLY/DAILY/WEEKLY сохранялись, но планировщика сводок нет — такие игроки молча
  переставали получать письма.

**Decision.**

- Ответ настроек — `settingsView`: без id/userId и без URL вебхука; `discordEnabled`,
  маска `discord.com/api/webhooks/<id>/••••`, `emailAvailable` (SMTP настроен).
- Discord: `allowed_mentions: { parse: [] }`, `redirect: 'error'`, таймаут 5 с, обрезка до
  2000 символов; адрес — только хосты Discord и путь `/api/webhooks/<id>/<token>` (было).
- Письма: `escapeToHtml` для всего текста уведомлений.
- `digest/test` без SMTP — 503 `email_unavailable`; проверочные отправки (Discord, письмо) —
  ≤ 5 за 10 минут; сохранение вебхука — ≤ 10 в минуту.
- Сводка по расписанию отложена до фоновых задач: `PATCH /notifications/digest` принимает
  только INSTANT, а уже сохранённые другие режимы доставляются сразу (письма не теряются).
- Web «Настройки → Уведомления»: «Какие уведомления получать» — только типы, которые сайт
  реально отправляет (выключенный тип не приходит никуда; объявления, техработы и модерация
  — всегда); «Уведомления на почту» (вкл/выкл, «Прислать сводку непрочитанных», честное «не
  настроено» без SMTP); «Уведомления в Discord» (подключить, маска, проверить, отключить с
  подтверждением); «Сбросить» с `ConfirmDialog`.

**Consequences.** Новые типы уведомлений (заказы, награды, достижения…) добавлять в список
UI вместе с функцией, которая их отправляет. Сводка по расписанию — DEFERRED (PHASE 29).

## ADR-0111 — Комментарии профиля: видимость как у профиля, блокировки, реакции-ключи

**Context.** Срез 2.3 roadmap волн. API комментариев было, UI — нет. Аудит перед UI нашёл:
`GET /users/:username/comments` публичный и не проверял видимость профиля (комментарии
скрытого профиля видны всем); `canComment` не учитывал блокировку (заблокированный писал при
политике EVERYONE); реакции и жалобы — тоже без проверки видимости; реакции отдавались строками
с `userId` реагировавших; реакция — свободная строка до 16 символов (любой текст); владелец не
мог убрать чужой комментарий со своей стены; ссылки уведомлений — на старый `/users/`.

**Decision.**

- Видимость профиля — общий helper `profiles/visibility.ts` (`canViewProfile`,
  `isBlockedBetween`); его используют профиль и комментарии. Список, создание, правка,
  удаление, реакция и жалоба — только если профиль виден зрителю, иначе 404.
- Писать нельзя при блокировке в любую сторону; реагировать — при блокировке с автором.
- Ответ — `CommentView`: автор (публичные поля, аватар-URL), реакции — счётчики по набору и
  своя реакция (без списка реагировавших), `canEdit`/`canDelete`; страница — плюс
  `commentsEnabled` (владелец и модерация) и `canComment` для зрителя.
- Реакции — ключи `like | heart | laugh | fire | wow` (allowlist в DTO); иконки — lucide на
  web (emoji в интерфейсе запрещены ADR-0085). Неизвестные старые значения не показываются.
- Удаляет автор или владелец профиля (soft delete); жалоба на свой комментарий — 403.
- Упоминание не уведомляет того, кому профиль не виден. Ссылки — `/u/<ник>#comment-<id>`.
- Web: блок «Комментарии» на `/u/[username]` (если модуль включён): форма по правам,
  «Войдите…», «ограничил», «отключены»; текст — простой с переносами; реакции; меню —
  изменить / пожаловаться (окно с причиной) / удалить (с подтверждением); «Показать ещё».

**Consequences.** Ответы на комментарии (`parentId`) API поддерживает, UI веток — позже;
закреп владельцем — P2 (новый эндпоинт).

## ADR-0112 — Личные сообщения: раздел на сайте и закрытые обходы приватности

**Context.** Срез 2.4 roadmap волн. API ЛС (REST + WS `/messages`) было, раздела на сайте —
нет (`MESSAGES_ROUTE_AVAILABLE = false`). Аудит перед UI нашёл: групповая беседа добавляла
любых игроков без учёта их политики ЛС и блокировок (обход «не принимаю сообщения»); личную
беседу можно было создать и писать в неё после блокировки; реакцию мог поставить любой, зная
id сообщения (без членства), правка/удаление — тоже без проверки членства; удалённые сообщения
отдавались вместе с текстом; реакция — свободная строка; превью приглашения отдавало беседу
целиком; WS-действия edit/delete/react не отвечали ack.

**Decision.**

- Одна проверка «можно ли писать» (`dmRefusal`): нет блокировки в любую сторону и это
  разрешает политика ЛС получателя. Применяется к личной беседе и к каждому добавляемому в
  группу (отказ — 403 со списком ников; неизвестный ник — 404). Сообщение в личную беседу
  после блокировки — 403.
- Реакция, правка, удаление — только участнику беседы; реакции — ключи `like | heart | laugh
| fire | wow` (как у комментариев, ADR-0111).
- Удалённое сообщение в истории и в списке бесед — `isDeleted` без текста.
- Превью приглашения — только `id/title/type` беседы. WS edit/delete/react отвечают ack
  `{ ok, error? }` (как send).
- Web: `/messages` (беседы, непрочитанные, «Новая группа»), `/messages/[id]` (история «Загрузить
  раньше», свои справа, правка/удаление своих — удаление с подтверждением, реакции иконками,
  «печатает…», Enter/Shift+Enter, отметка прочитанного; группа — ссылка-приглашение и «Выйти» с
  подтверждением), `/messages/invite/[code]`. Действия — через WS с ack, без соединения — REST.
  `MESSAGES_ROUTE_AVAILABLE = true` (push и ссылки ведут в беседу). «Написать» на профиле
  (вошедшим, не на себе); «Сообщения» в меню профиля.

**Consequences.** Управление участниками группы (добавить/исключить, роли) — новое API, P2;
вложения — блокер S3 (R3). Лимит частоты сообщений по WS — вместе с общим чатом (2.5).

## ADR-0113 — Общий чат: панель на сайте, WS закрыт при выключенном модуле, лимит частоты

**Context.** Срез 2.5 roadmap волн. Backend чата (REST + WS `/chat`, модерация) был, на сайте —
кнопка «скоро». WS `/chat` не учитывал выключенный модуль и техработы (REST закрывал
`SiteModuleGuard`, WS — нет), лимита частоты сообщений не было, `send_message` не отвечал ack.
Аватары авторов (а в ЛС — участников и отправителей) отдавались ключом хранилища, а не URL.

**Decision.**

- WS `/chat`: подключение и отправка отклоняются, если модуль «Чат» выключен или идут техработы
  (как REST; `system.maintenance.bypass` проходит).
- Не больше 5 сообщений за 10 секунд на игрока во всех каналах (Redis `chat:rate:<id>`) —
  «Слишком часто — подождите несколько секунд.».
- `send_message` отвечает ack `{ ok, message }` / `{ ok: false, error }`.
- Аватары авторов в чате и участников/отправителей в ЛС — через `StorageService.publicUrl`.
- Web: кнопка чата открывает панель (Sheet справа): каналы, история «Загрузить раньше»,
  закреплённое, онлайн, отправка через WS с ack (Enter / Shift+Enter); гость читает (опрос 15 с),
  писать — после входа; «только чтение» и мут/бан — плашкой вместо поля ввода; текст — без HTML.

**Consequences.** Клиентских настроек чата пока нет (требование «на этом устройстве» — когда
появятся). Правка/удаление/закреп из панели — у модераторов в админке; в панели — позже.
Аватары авторов новостей и событий — та же проблема (ключ вместо URL), отдельной задачей.

## ADR-0114 — Лента активности: видимость как у профиля, честные настройки, страницы ленты

**Context.** Срез 2.6 roadmap волн. API ленты было, страниц — нет. Аудит нашёл: лента игрока,
отдельная запись и её реакции не учитывали видимость профиля и блокировки (активность скрытого
профиля видна всем); глобальная лента показывала PUBLIC-записи игроков со скрытым профилем;
реакции — свободная строка, в ответе — строки с `userId`; аватары — ключом хранилища; списка
комментариев записи не было; настройки ленты (`ActivityFeedSettings`) нигде не применялись, а
единственный тип записей, который сайт создаёт, — «Новая дружба».

**Decision.**

- Видимость записи = видимость профиля автора (`canViewProfile`, ADR-0111) + видимость записи
  (PUBLIC / FRIENDS / владелец). Глобальная лента — только игроки с открытым профилем
  (EVERYONE) и без бана.
- Ответ `ActivityView`: автор (аватар-URL), для дружбы — ник друга, реакции — счётчики по ключам
  `like | heart | laugh | fire | wow` и своя реакция, число комментариев. `GET
/activity/:id/comments` — по видимости записи.
- Запись о дружбе создаётся по настройкам ленты отправителя: `showFriendships`,
  `friendshipsVisibility` (раньше — всегда FRIENDS, настройки игнорировались).
- Web: `/feed` (глобальная), `/feed/[id]` (запись, комментарии, отправка, удаление своих с
  подтверждением), блок «Активность» на профиле, «Лента активности» в «Приватности» — только
  применяемые настройки (дружба: показывать и кому; уведомления о комментариях).

**Consequences.** Остальные настройки ленты (покупки, достижения, бейджи…) появятся в UI вместе
с функциями, которые создают такие записи. Ссылки уведомлений о комментариях — `/feed/<id>`.

## ADR-0115 — Аватары связанных пользователей в ответах новостей и событий — URL

**Context.** После ADR-0107 авторы новостей и создатели событий выбираются через
`PUBLIC_USER_SELECT`, где `avatar` — ключ хранилища из БД; правило проекта — медиа в ответах
только URL (`StorageService.publicUrl`). Мест выдачи много (списки, featured, latest, popular,
по slug, комментарии новостей, события), авторы вложены.

**Decision.** `AvatarUrlInterceptor` (`modules/files`): на публичных контроллерах новостей и
событий рекурсивно переводит строковые поля `avatar` в URL; обходит только простые объекты
(Date, Decimal, Buffer — как есть), глубина ≤ 8; уже абсолютные адреса не меняются. Друзья,
комментарии профиля, ЛС, чат и лента активности переводят аватары в своих сервисах.

**Consequences.** Новые публичные ответы со связанными пользователями — либо `publicUrl` в
сервисе, либо этот перехватчик на контроллере.

## ADR-0116 — Темы сайта: правила, информация, FAQ и юридические документы из Topic

**Context.** Срезы 3.1 (P0) и 3.2 (P1). API тем (`GET /topics`, `GET /topics/:slug`, видимость по
`TopicVisibility`) было; на сайте `/rules` показывал только карточки без текста, `/legal/[doc]` —
статичную заглушку, страниц `/rules/[slug]`, `/info/[slug]`, `/faq` не было. Тексты юридических
документов владелец ещё не передал (🚫).

**Decision.**

- `TopicArticle`: тема по slug, «Редакция от <дата>» (`updatedAt`), текст — `SafeMarkdown`
  (ADR-0100: без HTML, ссылки только http(s)/относительные); 404 — заглушка вызывающей страницы.
- `/rules/[slug]`, `/info/[slug]` — страница темы; карточки `/rules` ведут на неё.
- `/faq` — темы категории FAQ раскрывающимся списком.
- `/legal/[doc]` (terms, privacy, personal-data, cookies, refunds) — текст из темы с тем же slug и
  датой редакции; пока владелец не опубликовал — прежняя честная заглушка «Документ готовится».
  Редактирование — срез 7.4 (админка тем).

**Consequences.** Чтобы опубликовать документ, владелец создаёт тему категории DOCUMENTS со slug
документа. Согласия при регистрации (ADR-0070) ссылаются на `/legal/<slug>` — после публикации
там будет действующая редакция. Без оферты и политики возвратов оплата (4.3) не запускается.

## ADR-0117 — Новости на сайте; комментарии и реакции только у опубликованных

**Context.** Срез 3.3. API новостей было, страниц `/news` и `/news/[slug]` — нет; карточки на
главной никуда не вели, пункт «Новости» в футере — «недоступен». Аудит: комментарии
(`GET /news/:slug/comments`) и реакции на них работали и для черновика (по slug); реакция —
свободная строка; в ответе — строки реакций с `userId`.

**Decision.**

- Комментарии и реакции — только у опубликованной новости (черновик — 404). Реакции — ключи
  `like | heart | laugh | fire | wow`; в ответе — счётчики, своя реакция, `canEdit`/`canDelete`.
- Web: `/news` — опубликованные новости, фильтр по категории, страницы, ссылка на RSS;
  `/news/[slug]` — статья (безопасный Markdown), теги, лайк, «поделиться» (копирование ссылки),
  просмотры, комментарии с реакциями (иконки lucide), удаление своих с подтверждением; снятая —
  «не найдена». Карточки на главной ведут на статью, «Новости» в футере — доступен.

**Consequences.** `viewsCount` растёт на каждый просмотр (без дедупликации) — отдельной задачей.

## ADR-0118 — События на сайте; запись на прошедшее событие запрещена

**Context.** Срез 3.4. API событий (список, «мои», участие с лимитом и дедлайном) было, страниц
`/events`, `/events/[slug]` — нет; карточки событий на главной никуда не вели. На прошедшее
событие можно было записаться.

**Decision.** `POST /events/:id/attendance` для прошедшего события (`endsAt ?? startsAt` в
прошлом) — 403 «Событие уже прошло»; выйти (`DELETE`) можно. Web: `/events` (все и «Мои
события»), `/events/[slug]` (описание — безопасный Markdown, время, место, сервер, участники;
«Пойду» / «Интересно» / «Не пойду»; прошедшее — без записи; не найдено — понятное состояние);
карточки на главной ведут на событие.

**Consequences.** Гонка лимита участников (подсчёт и запись не в одной транзакции) — отдельной
задачей при росте нагрузки.

## ADR-0119 — Обращения: внутренняя заметка персонала не уходит автору

**Context.** Аудит перед срезом 3.5: `GET /reports/:reportNumber` и `GET /reports` отдавали автору
обращения строку `Report` целиком, включая `internalNote` — внутреннюю заметку персонала.

**Decision.** Для автора (не персонала) `internalNote` вырезается: в списке — `omit` в запросе, в
карточке — до ответа. Персонал видит заметку как раньше. e2e `reports` проверяет оба пути.

**Consequences.** Новые поля «только для персонала» в `Report` — так же исключать из ответов автору.

## ADR-0120 — Обращения на сайте; цель обязательна только для жалоб

**Context.** Срез 3.5. API обращений было, страниц `/support*` — нет. `CreateReportDto.targets`
требовал минимум одну цель для любого типа: для технической проблемы или «Другого» пользователю
пришлось бы выдумывать «нарушителя».

**Decision.** `targets` может быть пустым; `ReportsService.createReport` требует цель только для
`PLAYER_COMPLAINT` / `ADMIN_COMPLAINT` (400 «Укажите ник нарушителя»). Web: `/support` (типы
обращений и «Мои обращения»), `/support/new/[type]` (для жалоб — ник нарушителя, сервер,
описание; после отправки — переход к обращению), `/support/[reportNumber]` (описание, решение,
переписка, ответ; правка только своего сообщения; закрытое — без ответа). «Проблема с донатом»
в UI не показывается — зона доната (hard gate).

**Consequences.** Вложения и ссылки-доказательства в форме — отдельной задачей (сейчас — в
тексте описания).

## ADR-0121 — Голосование на сайте; один голос — одна награда

**Context.** Срез 3.7. API голосования (сайты-рейтинги, вебхук с bcrypt-секретом, cooldown)
было, страницы `/vote` — нет; `/shop#bonus` обещал «награды за голосование». В вебхуке проверка
cooldown и начисление шли не атомарно: параллельные вебхуки одного игрока проходили проверку
оба и начисляли награду дважды (воспроизведено e2e: 2 награды из 5 запросов). Повтор голоса с
тем же `externalId` падал на уникальном индексе в 500 — сайты-рейтинги ретраят не-2xx.

**Decision.** Вебхук начисляет в транзакции под `pg_advisory_xact_lock` по паре «сайт + игрок»
и перепроверяет cooldown внутри неё; повтор `externalId` — 200 `{ accepted: false, reason:
'duplicate' }`. Web: `/vote` (сайты, награда «+N монет», «раз в N часов», таймер до следующего
голоса для вошедшего, подсказка указать свой ник; ссылки и логотипы — только http(s)); ссылка в
футере; `/shop#bonus` ведёт на `/vote`.

**Consequences.** Подключение реальных сайтов-рейтингов (аккаунты, секреты вебхуков) — действие
владельца в админке.

## ADR-0122 — Формы на сайте; приватность ответов и лимиты под блокировкой

**Context.** Срез 3.6. API форм (35 типов полей, черновики, приглашения, лимиты) было, страниц
`/forms*` — нет. Аудит перед UI: (1) персонал с правом на ответы получал `respondent` целиком —
email, IP последнего входа и прочие поля пользователя, в том числе у анонимных форм; (2)
черновик сохранялся в обход видимости формы, приглашения и сроков приёма; (3) `onePerUser`,
`maxResponses` и лимит приглашения проверялись вне транзакции — параллельные отправки их
обходили (e2e: 5 ответов при `maxResponses: 1`); (4) черновик оставался висеть после отправки;
(5) удаление черновика уменьшало `responsesCount`.

**Decision.** Ответы для персонала: автор — `PUBLIC_USER_SELECT` (ADR-0107), без `ipHash`; у
анонимного ответа нет автора и user-agent. Черновик — через те же проверки, что отправка
(`SaveDraftDto.inviteCode` для форм по приглашению). Отправка — в транзакции под
`pg_advisory_xact_lock` по форме с перепроверкой лимитов; черновик пользователя удаляется;
ответ — только `id`, `isComplete`, `isAnonymous`, `completedAt`. Удаление черновика счётчик не
трогает. Web: `/forms` (открытые формы, «Мои ответы» с черновиками), `/forms/[slug]`,
`/forms/invite/[code]`: все типы полей, шаги, черновик и автозаполнение email для вошедших,
капча, сроки/лимит/«уже отвечали»/«нужен вход» — понятными состояниями; `redirectUrl` — только
http(s) или путь сайта; `customCss` не применяется.

**Consequences.** Загрузка файлов (FILE_UPLOAD, IMAGE_GALLERY) — после хранилища (S3, R3);
форма с обязательным файловым полем пока не отправляется. Условная логика полей,
`timeLimit` и показ результатов — отдельной задачей. Ссылка «Формы и заявки» — в футере.

## ADR-0123 — WebSocket: модуль ЛС и лимиты событий сокетов

**Context.** Срез 8.7. Глобальный `ThrottlerGuard` действует только на HTTP: через сокет `/messages`
можно было слать сообщения, правки, реакции и «печатает…» без ограничений (рассылка всем
участникам беседы), а в чате — правки, удаления и «печатает…». Шлюз ЛС не проверял модуль
`direct-messages`: выключенный модуль закрывал только REST. Чат проверял модуль с ADR-0113.

**Decision.** Общий лимитер `wsAllowed` (Redis, фиксированное окно, `SET NX EX` + `INCR` в
MULTI — ключ без TTL не остаётся) по пространству имён, группе и пользователю: `send` 10 / 10 с,
`mutate` (правка, удаление, реакции, прочтение) 20 / 10 с, `typing` 10 / 10 с, `room` (вход и
выход из комнат) 30 / 10 с. События с подтверждением отвечают «Слишком часто — подождите
несколько секунд.», «печатает…» и комнаты сверх лимита молча отбрасываются. Шлюз ЛС проверяет
модуль при подключении и при отправке (сотрудники с `system.maintenance.bypass` проходят).
Отправка в чат дополнительно ограничена в сервисе (5 / 10 с, ADR-0113).

**Consequences.** Лимиты — константы `WS_LIMITS`; вынос в настройки сайта — по необходимости.

## ADR-0124 — Страницы ошибок в «Полдне»

**Context.** Срез 8.2. В `app/` не было `not-found.tsx`, `error.tsx`, `global-error.tsx`:
несуществующий адрес и сбой страницы показывали стандартные экраны Next.js (английский текст,
в dev — стек).

**Decision.** Общий `ErrorScreen` (по образцу offline-страницы ADR-0086: локальный логотип,
карточка «Полдня», без стекла): 404 — «Страница не найдена» с «На главную» и «Обращения»
(`noindex`); сбой страницы — «Что-то пошло не так» с «Попробовать снова» (`reset`) и «На
главную»; сбой приложения (`global-error`) — свой `<html>` со стилями и темой, «На главную» —
полная перезагрузка. Текст исключения, стек и digest не показываются.

**Consequences.** Отправка ошибок в систему мониторинга — отдельной задачей (нет сервиса).

## ADR-0125 — Честность настроек сайта

**Context.** Срез 8.3. Часть переключателей `/admin/settings` сохранялась, но ничего не меняла:
`maxUsersLimit`, `defaultNotificationsEnabled`, `registrationRequiresApproval`, `ipWhitelist`
(раздел безопасности обещал «Пустой список — ограничений нет»). `requireAdmin2fa` уже
применяется (ADR-0109); `autoModeration` и `profanityFilter` честно подписаны как не
действующие (нужен словарь владельца).

**Decision.** Применены: `maxUsersLimit` — регистрация закрывается (403 `registration_closed`),
когда пользователей (без системных) не меньше лимита; проверка — на старте и на завершении
регистрации вместе с `registrationEnabled`. `defaultNotificationsEnabled` — новые
`NotificationSettings` и «Сбросить» берут письма и push из настройки сайта (уведомления на
сайте — всегда). Убран из админки переключатель «Требуется одобрение»: очереди одобрения
аккаунтов нет, поле в БД остаётся. `ipWhitelist` не включается ночью без владельца: за прокси
nginx адрес клиента зависит от `trust proxy`, ранее сохранённый список мог бы закрыть доступ к
админке — подпись в разделе безопасности теперь честная.

**Consequences.** Включение `ipWhitelist` (guard входа в админку + проверка, что текущий IP в
списке при сохранении) — после решения владельца. Очередь одобрения аккаунтов — по запросу.
GA/Метрика — в 8.5, meta — в 8.4.

## ADR-0126 — SEO: метаданные из настроек сайта, OG, sitemap, robots

**Context.** Срез 8.4. `metaTitle`, `metaDescription`, `metaKeywords` из `/admin/settings`
сохранялись, но сайт отдавал захардкоженные метаданные; не было OG-изображения и sitemap,
`robots.txt` был статичным файлом без ссылки на sitemap и без личных разделов.

**Decision.** Корневой `generateMetadata` берёт описание, ключевые слова и заголовок для
соцсетей из `/site/settings` (кэш 5 минут, ожидание ≤ 3 с), без API — значения по умолчанию;
вкладка по-прежнему всегда «twomc.su». `metadataBase` — `NEXT_PUBLIC_SITE_URL` (по умолчанию
`https://twomc.su`). OG-изображение по умолчанию — `app/opengraph-image.tsx` (латиница:
встроенный шрифт next/og без кириллицы). `app/sitemap.ts` — постоянные публичные страницы,
опубликованные новости, события, темы правил и информации (раз в час). `app/robots.ts` вместо
`public/robots.txt`: закрыты админка, design-lab, настройки, сообщения, друзья, уведомления,
лента, обращения, служебные `/auth`, `/site-connect`, приглашения форм; ссылка на sitemap.

**Consequences.** Canonical и метаданные отдельных страниц (новость, событие, профиль) —
после перевода этих страниц на серверный рендер заголовка; сейчас они клиентские.

## ADR-0127 — Рейтинги на сайте; скрытая статистика не попадает в топ

**Context.** Срез 5.8. `GET /leaderboards` (время в игре, убийства, монеты, достижения, покупки)
было, страницы `/leaderboards` — нет. Аудит: рейтинги включали игроков, скрывших статистику
(`hideStatistics`), с профилем не для всех, забаненных и системные аккаунты; места
нумеровались до фильтрации — с пропусками.

**Decision.** В рейтинг попадают только пользователи с открытым всем профилем
(`profileVisibility = EVERYONE`), не скрывшие статистику, не забаненные и не системные; места
считаются после фильтра. Web: `/leaderboards` — переключатель рейтингов, топ-10 со ссылками на
профили, время — «Ч ч М мин»; пустые игровые рейтинги честно объясняют, что статистика
придёт с сервера (5.10), пустые монеты ведут на голосование. Ссылка «Рейтинги» в футере.

**Consequences.** Игровые рейтинги наполнятся после 5.10 (статистика из игры).

## ADR-0128 — Обращения в админке; персоналу — только публичные поля пользователей

**Context.** Срез 7.3. API модерации обращений (`/moderation/reports/*`, `/admin/reports/*`) было,
админ-страниц — нет. Аудит: очередь модерации, архив и список проблем с донатом отдавали
`author`/`assignedTo` целиком — email, IP последнего входа и прочие поля пользователя; карточка
для персонала (`GET /reports/:number`) автора не содержала вовсе.

**Decision.** Во всех ответах персоналу автор и исполнитель — `PUBLIC_USER_SELECT` (ADR-0107);
карточка персонала дополнена автором и исполнителем. Web: `/admin/reports` — очередь с
фильтрами статуса и типа, исполнитель, переход в карточку; `/admin/reports/[reportNumber]` —
описание, нарушители, переписка (удалённые сообщения помечены) с ответом, заметки персонала,
«Взять себе / Снять с себя», статус, решение, блокировка ответов автора; каждое действие — по
своему праву `reports.*`. Пункт «Обращения» в навигации админки (`reports.view`).

**Consequences.** Архив, report-ban, закреп сообщений и заметок, удаление сообщений — следующим
срезом админки обращений; обработка «Проблем с донатом» — после hard gate доната.

## ADR-0129 — Достижения на сайте; видимость достижений игрока — как у профиля

**Context.** Срез 5.7 (часть 1). API достижений (каталог с прогрессом, карточка, достижения
игрока, витрина) было, страниц `/achievements*` — нет. Аудит: `GET /users/:username/achievements`
проверял видимость сам и иначе, чем профиль — друзьям профиль «для друзей» был закрыт, а
блокировка не учитывалась; в списке игрока оставались выключенные администрацией достижения.

**Decision.** Видимость достижений игрока — общая `canViewProfile` (ADR-0111): друзья видят
профиль «для друзей», блокировка в любую сторону скрывает; выключенные достижения в списке
игрока не показываются. Web: `/achievements` — категории, «Все / Полученные / Не полученные»
для вошедших, прогресс «N из M», редкость; `/achievements/[slug]` — описание, награда, сколько
игроков получили, прогресс или дата получения; секретное до получения — «не найдено». Иконки —
только http(s) или путь сайта.

**Consequences.** Витрина в `/settings/appearance`, витрина на профиле и тост
`ACHIEVEMENT_UNLOCKED` — частью 2. Ссылка «Достижения» — в футере и в sitemap.

## ADR-0130 — Статус серверов: кэш 30 с вместо пинга на каждый запрос; виджет экранирован

**Context.** Аудит перед админкой серверов (7.5). По ADR-0041 каждый запрос статуса
(`/servers/:slug/status`, `/servers/overview`, `/servers/widget`) делал живой Server List Ping и
писал строку в `ServerStatusLog`; главная опрашивает обзор раз в минуту у каждого посетителя —
пинги игрового сервера и записи в БД росли с числом посетителей (и их мог раскачать любой
аноним). Публичный `GET /servers/widget` отдаёт HTML (`text/html` на домене API) и подставлял
название сервера без экранирования (инлайн-скрипты блокирует CSP API, но HTML-инъекция
оставалась).

**Decision.** Снапшот статуса — в Redis на 30 с (`mc:status:<id>`); пинг и строка истории — не
чаще раза в окно на сервер: пишет тот запрос, чей `SET NX` положил снапшот. Правка и удаление
сервера сбрасывают кэш. Redis недоступен — поведение как раньше (пинг и запись), статус не
ломается. В виджете название — через `escapeToHtml`.

**Consequences.** `/servers/:slug/players` по-прежнему пингует живьём (редкий запрос). Фоновый
сборщик статусов и график истории — 8.6 / 5.6. Подключение к адресам из настроек сервера
остаётся правом администратора (`servers.create/edit`): игровой сервер может стоять на том же
хосте, поэтому внутренние адреса не запрещаются.

## ADR-0132 — Модерация чата: персоналу — только публичные поля пользователей

**Context.** Аудит перед админкой чата (7.7). `GET /admin/chat/mutes`, `/admin/chat/bans`,
`/admin/chat/messages/search` и `/admin/chat/messages/:id` отдавали `user`/`author` целиком —
email, IP последнего входа и прочие поля — всем с правами `chat.*.view` (публичный чат уже
использовал `PUBLIC_USER_SELECT`).

**Decision.** В ответах модерации чата пользователь и автор — `PUBLIC_USER_SELECT` (ADR-0107).

**Consequences.** Админ-страница чата (каналы, муты, баны, поиск) — следующим срезом 7.7.

## ADR-0133 — Админ-ответы: авторы и покупатели без лишних полей пользователя

**Context.** Точечная проверка после ADR-0122/0128/0132: админ-списки и карточки новостей
(`author`), событий и форм (`createdBy`) и список заказов (`user`) по-прежнему отдавали
пользователя целиком (глобальный omit скрывает только хеш пароля) — IP последнего входа,
причины банов, флаги приватности и прочее.

**Decision.** Автор/создатель (сотрудник) — `PUBLIC_USER_SELECT` (ADR-0107). Покупатель в
списке заказов — публичные поля и `email` (нужен финансам для заказа и возврата), остальное не
отдаётся.

**Consequences.** Новые админ-ответы со связанными пользователями — только с явным `select`;
`include: { <user-relation>: true }` в ответах не использовать.

## ADR-0131 — Серверы в админке

**Context.** Срез 7.5. API `/admin/servers*` и `/admin/server-categories` было, админ-страницы —
нет: серверы заводились только через БД/seed.

**Decision.** `/admin/servers` (`servers.view`): список (адрес:порт, тип, категория, «Скрыт»);
«Добавить сервер» и «Изменить» — диалог формы с проверкой slug (`[a-z0-9-]`), порта (1–65535) и
обязательных полей (`servers.create` / `servers.edit`); категория — если есть
`server_categories.view`; «Удалить» — через подтверждение (`servers.delete`); «Журнал» —
последние 20 записей статуса (`servers.logs`). Числа — без нативного числового input
(ADR-0087). Пункт «Серверы» — в группе «Система» навигации админки.

**Consequences.** CRUD категорий серверов и снятие категории у сервера (API принимает только
строку) — следующим срезом.

## ADR-0134 — Модерация чата в админке

**Context.** Срез 7.7. API `/admin/chat/*` (муты, баны, поиск сообщений, каналы) было,
админ-страницы — нет: снять мут или бан можно было только запросом к API.

**Decision.** `/admin/chat` — вкладки по правам: «Муты» (`chat.mutes.view`: игрок, причина,
срок, заметка; «Снять мут» — `chat.mutes.delete`), «Баны» (`chat.bans.view`; «Снять бан» —
`chat.bans.delete`), «Поиск сообщений» (`chat.messages.search.view`: текст, автор, канал, время,
пометка удалённых, пагинация). Пункт «Чат» — в группе «Коммуникации» навигации админки.

**Consequences.** Управление каналами (создание, правка, удаление) — следующим срезом; списка
каналов для админки (включая выключенные) в API пока нет.

## ADR-0135 — Обращения в админке, часть 2: архив, закрепы, скрытие, запрет обращений

**Context.** Продолжение ADR-0128: архив, report-ban, закреп и удаление сообщений были только в
API (`/admin/reports/*`, `/moderation/reports/:n/messages/*`).

**Decision.** Очередь — вкладки «Очередь / Архив» (`reports.archived.view`). Карточка: «В архив /
Вернуть из архива» (`reports.archive` / `reports.unarchive`), «Запретить автору обращения» с
обязательной причиной (`reports.ban`), у сообщений — «Закрепить / Открепить»
(`reports.messages.pin/unpin`) и «Скрыть» (мягкое удаление, `reports.messages`).

**Consequences.** Срок запрета обращений, снятие запрета и удаление обращения целиком
(`reports.delete`) — по запросу; «Проблемы с донатом» — после hard gate доната.

## ADR-0136 — Витрина достижений в настройках

**Context.** Срез 5.7, часть 2. Витрина достижений в профиле показывалась (`profile-showcase`),
API `POST /users/me/achievements/showcase` было, но выбрать достижения игрок не мог.

**Decision.** `/settings/showcase` («Витрина»): полученные достижения с отметкой (до 10), порядок
на витрине — кнопками «Выше / Ниже», «Сохранить витрину» отправляет полный набор; незавершённые
не предлагаются (API их и не примет). Пункт «Витрина» в навигации настроек.

**Consequences.** Тост `ACHIEVEMENT_UNLOCKED` при получении — отдельной задачей (нужен разбор
событий WS `/notifications`).

## ADR-0137 — Уведомление «Новое достижение»

**Context.** Срез 5.7 (тост `ACHIEVEMENT_UNLOCKED`). Тип уведомления в схеме был, web показывает
тост и колокольчик для любого нового уведомления (WS `notification:new`), но модуль достижений
уведомлений не создавал — ни при автоматическом получении, ни при ручной выдаче.

**Decision.** При получении достижения (пересчёт прогресса и ручная выдача модератором)
создаётся уведомление `ACHIEVEMENT_UNLOCKED`: «Новое достижение», название, ссылка на
`/achievements/<slug>`; учитываются настройки уведомлений пользователя. Сбой уведомления
логируется и не отменяет выдачу. `NotificationsModule` глобальный — цикла модулей нет.

**Consequences.** Отдельный «праздничный» тост с иконкой достижения — по запросу.

## ADR-0138 — Достижения в админке

**Context.** Срез 7.6 (геймификация в админке), первая часть. API `/admin/achievements` (CRUD и
`check-all-users`) было, страницы — нет. Аудит API: пересчёт всех игроков идёт синхронно в запросе
и мог запускаться параллельно (двойная нагрузка на БД); `rewardBadgeType` принимал любую строку,
а опечатка молча терялась при выдаче; очистить текст награды при правке было нельзя;
`rewardRubies` хранится, но не начисляется (баланса рубинов нет — ADR-0035).

**Decision.** `/admin/achievements` («Геймификация → Достижения»): список с иконкой, редкостью,
категорией, условием («Друзей ≥ 5», «Номер регистрации ≤ 100») и числом получивших; создание и
правка в диалоге; удаление (каскадом пропадает прогресс игроков) и пересчёт — с подтверждением,
итог пересчёта — в тосте. Каждое действие — по своему праву `achievements.*`. Slug и тип условия
при правке не меняются (как и в API). Условия, которые API пока не считает (серия дней, просмотры
профиля, особое), помечены в форме — выдать их можно только вручную. Рубины-награда в форму не
выводятся. API: замок `achievements:check-all:lock` в Redis (SET NX, TTL 15 мин, снимается
только своим токеном) — второй запуск получает 409; `rewardBadgeType` — только `UserBadgeType`,
`null` очищает значок, титул и сообщение награды; `iconUrl` — до 500 символов.

**Consequences.** Пересчёт по-прежнему синхронный: на большой базе запрос долгий, а если он
длиннее 15 минут, замок истечёт раньше. Перенос в фоновую задачу — срез 8.6. Остальные разделы
7.6 (награды, должности, отделы, свои должности, медиа-заявки) — следующими срезами.

## ADR-0139 — Награды в админке и подразделы навигации

**Context.** Срез 7.6, часть 2. API `/admin/awards` (CRUD) было, страницы — нет. Аудит API:
параллельная выдача одной награды падала 500 (проверка «уже выдана» проходила у обоих запросов,
уникальный индекс пропускал один); `color` и `iconUrl` не проверялись; описание, цвет и редкость
нельзя было очистить; в админ-списке не было видно, у скольких игроков награда. Навигация админки
дошла до предела в 20 пунктов (тест «без длинного списка», ТЗ админки §62), а в 7.6 ещё пять
разделов.

**Decision.** `/admin/awards`: список с иконкой, редкостью и числом обладателей; создание и правка
в диалоге (slug при правке не меняется, «Показывать на сайте» — только при правке, как в API);
удаление с подтверждением, где названо число обладателей. Цвет в форме не показывается — на сайте
он пока нигде не выводится (рамку задаёт редкость). API: `holdersCount` в админ-списке; P2002 при
выдаче → 409; цвет только `#RRGGBB`; `iconUrl` до 500 символов; `null` очищает описание, цвет и
редкость. Навигация: у пункта могут быть подразделы (`sections`) — пункт активен на любой их
странице, требует право хоть на один, ведёт на первый доступный (`resolveNavItem`), в оболочке
над страницей — вкладки подразделов (если доступно больше одного), в командной палитре подразделы
ищутся отдельно. «Геймификация → Достижения и награды» = вкладки «Достижения» и «Награды».

**Consequences.** Предел 20 пунктов сохраняется. Остальные разделы 7.6 (должности, отделы, свои
должности, медиа-заявки) встают подразделами. Выдача наград игроку — из карточки пользователя,
отдельным срезом.

## ADR-0140 — Команда в админке: должности, отделы, свои должности

**Context.** Срез 7.6, часть 3. API должностей (`/positions*`), отделов (`/admin/departments`) и
своих должностей (`/admin/custom-positions`) было, страниц — нет. Аудит API: дубль названия или
slug давал 500 (P2002 без обработки) во всех трёх; описание, цвет, фон и иконку нельзя было
очистить; иконка без ограничения длины; удаление должности, на которую ссылается товар магазина,
отвечало «назначена пользователям»; в списках не было видно, сколько у записи игроков.

**Decision.** Пункт навигации «Команда» (группа «Люди и доступ») с подразделами «Должности»,
«Отделы», «Свои должности» (механизм ADR-0139); «Роли» и «Permissions» объединены в «Роли и права»
с подразделами — предел 20 пунктов сохраняется. `/admin/positions`: каталог по приоритету (цвет,
группа, число игроков), создание и правка (название и slug — только при создании, как в API; цвет
— ColorPicker), удаление с подтверждением; удалить нельзя должность по умолчанию, назначенную
игрокам или выдаваемую товаром — кнопка недоступна и объясняет причину. Иконка и фон должности
в форме не показываются — на сайте они не выводятся. `/admin/departments` и
`/admin/custom-positions` — общий каталог (название, slug, цвет, описание, активность; у отделов
— порядок), удаление с подтверждением, где названо, со скольких оно снимется. API: P2002 → 409;
счётчики `usersCount`/`productsCount`, `membersCount`, `usersCount` в админ-списках; перед
удалением должности — точная причина отказа; `null` очищает описание, цвет, фон и иконку; иконка
до 100 символов.

**Consequences.** Назначения игроку (должность, отделы, своя должность, награды) — из карточки
пользователя, следующим срезом. `positions.assign` позволяет выдать любую должность, в том числе
выше своей — ограничение по приоритету оставлено на решение владельца.

## ADR-0142 — Назначения из карточки пользователя

**Context.** Срез 7.6: «назначения — из карточки пользователя». API выдачи было (должность,
отделы, своя должность, награды), но в карточке назначать было нельзя, а наград игрока админка
вообще не видела — эндпоинта не было.

**Decision.** Вкладка «Команда и награды» в `/admin/users/:id` — видна с правом хотя бы на одно
назначение (`positions.assign`, `departments.assign`, `custom_positions.assign`, `users.awards`).
Блоки: должность (текущая, назначить другую), отделы (убрать, добавить), своя должность (снять,
назначить или заменить), награды (список с датой, снять с подтверждением, выдать). Блок виден
только с правом на его действие; варианты для выбора берутся из каталога и только с правом на его
просмотр — без него можно убрать, но не добавить. В выборе нет уже назначенного и неактивного.
API: `GET /admin/users/:userId/awards` (право `users.awards`, то же, что у выдачи) — награды
игрока с датой, 404 для несуществующего.

**Consequences.** Выдача достижений вручную и снятие медиа-значка из карточки — отдельной
задачей. Хуки каталогов получили параметр `enabled`, чтобы не запрашивать каталог без права.

## ADR-0141 — Медиа-заявки в админке

**Context.** Срез 7.6, часть 4. API `/admin/media-requests` (очередь и решение) было, страницы —
нет. Аудит API: решение можно было принять повторно по уже рассмотренной заявке (отказ после
одобрения не снимал значок, два модератора одновременно перезаписывали друг друга); одобрение и
выдача значка шли без транзакции; игрок мог создать сколько угодно ожидающих заявок на одну
платформу; `channelUrl` принимал `ftp://` и ссылку без протокола, которую нельзя безопасно
открыть.

**Decision.** `/admin/media-requests` — подраздел «Пользователи» («Люди и доступ», механизм
ADR-0139): очередь ожидающих заявок с автором (ссылка на карточку), платформой, ссылкой на канал
(только http/https, `rel="noopener noreferrer nofollow"`) и описанием; одобрение с
подтверждением, отказ с необязательной причиной (игрок видит её в «Настройки → Медиа»). API:
решение только для `PENDING` — атомарный `updateMany` по статусу, значок в той же транзакции,
повторное решение — 409; одна ожидающая заявка на платформу (под `pg_advisory_xact_lock`) — 409;
`channelUrl` только http/https, до 500 символов, без протокола дописывается `https://`; в списке
— тег и аватар автора (публичный набор полей).

**Consequences.** Уведомление игроку о решении — вместе с общими уведомлениями модерации (позже).
Снятие уже выданного медиа-значка — из карточки пользователя, отдельной задачей.

## ADR-0143 — Новости в админке

**Context.** Срез 7.4 (контент), часть 1. API `/admin/news` (список, карточка, CRUD, закреп,
«главная», архивация) было, страниц — нет. Аудит API: `coverImage` и `ogImage` принимали любую
строку, а главная выводит обложку через `next/image`, который падает на хосте вне
`remotePatterns` — одна чужая ссылка роняла блок новостей на главной; админ-список отдавал полный
текст каждой новости (до 100 000 символов × 30); гонка двух создателей с одним slug давала 500;
статус «Запланирована» принимается, но автопубликации по расписанию нет — такая новость сама не
выйдет.

**Decision.** «Контент» получил вкладки «Обзор» и «Новости» (механизм ADR-0139). `/admin/news`:
список с фильтрами по статусу, категории и заголовку, закреп, «на главную» и архивация (с
подтверждением, вернуть — сменой статуса) — по своим правам `news.*`. `/admin/news/new` и
`/admin/news/:id`: редактор — заголовок, slug (только при создании), категория, статус, анонс,
текст в Markdown с предпросмотром тем же `SafeMarkdown`, что на сайте, обложка, теги через запятую
(без дублей, до 20), SEO-поля, комментарии. «Запланирована» в редакторе не предлагается;
существующая запланированная новость сохраняет статус с подсказкой «опубликуйте вручную». API:
`coverImage`/`ogImage` — только `https://cdn-files.twomc.su/…` или путь сайта (`SITE_IMAGE_URL`),
до 500 символов, `null` убирает обложку; админ-список без `content`/`contentHtml`; P2002 при
создании → 409.

**Consequences.** Автопубликация запланированных новостей — срез 8.6 (фоновые задачи), тогда
«Запланирована» вернётся в редактор. Загрузка обложки файлом — после R3 (хранилище в production).
Остальные разделы 7.4 (события, темы и юр. документы, формы, трансляции, голосование) — следующими
срезами.

## ADR-0144 — Голосование в админке

**Context.** Срез 7.4, часть 2. API `/admin/voting/sites` (CRUD, замена секрета) было, страницы —
нет. Аудит API: `url` принимал `ftp://`; `logoUrl` — любую строку; гонка двух создателей с одним
slug давала 500.

**Decision.** «Контент → Голосование» (`/admin/voting`): сайты-рейтинги с наградой и интервалом,
создание и правка, удаление с подтверждением. Секрет вебхука показывается один раз — после
создания и после замены (замена с подтверждением: старый секрет сразу перестаёт работать), с
копированием; API хранит только bcrypt-хеш. API: `url` — только http/https, `logoUrl` — только
https, оба до 500 символов, `null` убирает логотип; P2002 при создании → 409.

**Consequences.** Сайты-рейтинги подключает владелец (OWNER ACTION) — теперь из админки.

## ADR-0145 — Темы в админке: правила, FAQ, юридические документы

**Context.** Срез 7.4, часть 3. Темы питают «Правила», FAQ, страницы «Инфо» и юридические документы
(`/legal/:doc` берёт текст из темы с тем же slug — ADR-0116), но редактировать их было негде:
тексты юрдокументов владелец мог передать только разработчику. Аудит API: админ-список отдавал
полный текст тем; гонка slug давала 500; цвет не проверялся; описание, иконку и цвет нельзя было
очистить.

**Decision.** «Контент → Темы» (`/admin/topics`): список с фильтром по разделу, видимостью, метками
«Закреплена» и «Скрыта»; закреп и удаление (с подтверждением; «просто скрыть» — снять
«Опубликована») по своим правам `topics.*`. Редактор (`/admin/topics/new`, `/admin/topics/:id`):
заголовок, slug (только при создании), раздел, кому видна, описание, текст в Markdown с
предпросмотром тем же `SafeMarkdown`; для раздела «Документы» — подсказка, какие slug подхватывают
страницы `/legal/…` (terms, privacy, personal-data, cookies, refunds). Иконка и цвет в форме не
показываются — на сайте не выводятся. API: список без `content`/`contentHtml`; P2002 → 409; цвет
только `#RRGGBB`, иконка до 100 символов; `null` очищает описание, иконку и цвет.

**Consequences.** Тексты юрдокументов владелец публикует сам из админки. Порядок тем — через
`reorder` (перетаскивание — позже).

## ADR-0146 — Автопубликация запланированных новостей

**Context.** Срез 8.6 (фоновые задачи), первая задача. Статус «Запланирована» (`SCHEDULED` +
`scheduledFor`) был в API, но ничто его не публиковало — такая новость не выходила сама, поэтому
редактор (ADR-0143) его не предлагал. API принимал и дату в прошлом, и «запланированную» новость
без даты.

**Decision.** `NewsScheduler` — раз в минуту в процессе API, по образцу `AnnouncementsScheduler`
(ADR-0081, `setInterval` + `unref`, флаг «уже идёт», выключен при `NODE_ENV=test`) — вызывает
`NewsAdminService.publishDue()`: атомарный `updateMany` (`SCHEDULED` и `scheduledFor <= now` →
`PUBLISHED`, `publishedAt = now`), поэтому повтор в нескольких инстансах не публикует дважды.
Запланировать можно только на будущее: создание и правка, которые ставят `SCHEDULED` или меняют
дату, проверяют её — иначе 400. Редактор снова предлагает «Запланирована» с полем «Публикация»
(дата и время, проверка «в будущем» и на клиенте).

**Consequences.** Задержка выхода — до минуты. `@nestjs/schedule` и очередь на Redis из 8.6 пока не
подключались: для периодических задач этого масштаба хватает общего паттерна; сборщик статусов
серверов, экспорт по расписанию и массовые рассылки — следующими задачами 8.6.

## ADR-0147 — Сборщик статусов серверов

**Context.** Срез 8.6, сборщик статусов (для графика онлайна 5.6). После ADR-0130 строка истории
`ServerStatusLog` пишется только при запросе статуса с сайта и не чаще раза в 30 с на сервер: при
малом трафике (ночью) в истории дыры, график по ней был бы неверным.

**Decision.** `ServerStatusCollector` в модуле minecraft — раз в 5 минут (`setInterval` + `unref`,
флаг «уже идёт», выключен при `NODE_ENV=test`, как у планировщиков ADR-0081/0146) опрашивает
активные серверы по одному через `MinecraftStatusService.fetchAndLog`: свежий снапшот из Redis не
пингуется повторно, строку истории за окно пишет только первый (`SET NX`) — несколько инстансов API
историю не дублируют. Сбой одного сервера логируется и не останавливает остальных.

**Consequences.** История онлайна — не реже раза в 5 минут на сервер (~288 строк в сутки на
сервер); очистка старой истории и сам график 5.6 — отдельными задачами.

## ADR-0148 — События в админке

**Context.** Срез 7.4, часть 4. API `/admin/events` (список, создание, правка, публикация,
отмена с уведомлением участникам, удаление) было, страницы — нет. Аудит API: `coverImage` событий
принимал любую строку, а блок событий на главной выводит её через `next/image` — та же поломка
главной, что у новостей (ADR-0143); гонка двух создателей с одним slug давала 500.

**Decision.** «Контент → События» (`/admin/events`): список с фильтром по статусу (статус,
категория, начало, участники из мест), создание и правка в диалоге (название, slug — только при
создании, категория, кому видно, начало и конец, место, сервер, мест, «запись до», обложка,
описание в Markdown), публикация черновика, отмена опубликованного и удаление — с подтверждением,
по своим правам `events.*`. API: обложка — та же проверка `SITE_IMAGE_URL`, константа перенесена в
`common/site-image.ts` (её используют новости и события), `null` убирает обложку; P2002 при
создании → 409.

**Consequences.** Очистить уже заданные конец, «запись до» и лимит мест API пока не позволяет
(нет `null` в DTO) — задаются заново. Список участников события в админке — отдельной задачей.

## ADR-0149 — Формы в админке: ответы и статистика

**Context.** Срез 7.4, формы. API `/admin/forms` (список, карточка, публикация, закрытие, копия,
удаление, ответы, статистика, приглашения) было, страниц — нет. Конструктор полей (33 типа) —
большая отдельная работа; ответы и статистика нужны уже сейчас (заявки игроков приходят).

**Decision.** «Контент → Формы» (`/admin/forms`): список с поиском и фильтром по статусу, число
полей и ответов; публикация (кроме открытых), закрытие приёма (у открытых), копия (черновиком) и
удаление (в подтверждении названо число ответов, удаляются вместе с формой) — по своим правам
`forms.*`. Страница формы (`/admin/forms/:id`, право `forms.responses` или `forms.stats`):
вкладка «Ответы» — автор (тег) или «Анонимно» (обезличивание делает API, ADR-0124), пометка «Не
завершён», карточка ответа по полям формы, удаление ответа с подтверждением; вкладка «Статистика»
— доля завершённых и разбивка по вариантам (RADIO/SELECT/CHECKBOX). Файлы в ответах показываются
только числом — хранилище в production ещё не подключено (R3).

**Consequences.** Конструктор полей, приглашения по ссылке и правка настроек формы — следующими
срезами 7.4.

## ADR-0150 — Приглашения форм в админке

**Context.** Формы с видимостью «по приглашению» (`INVITE_ONLY`) открываются только по ссылке
`/forms/invite/:code`; API приглашений (`/admin/forms/:id/invites`: список, создание с лимитом и
сроком, удаление) было, но создать ссылку из админки было нельзя — такие формы были недоступны.

**Decision.** Вкладка «Приглашения» на странице формы (`/admin/forms/:id`, право `forms.invites`;
страница открывается и с одним этим правом): ссылки с числом использований и сроком, копирование
полной ссылки, создание (лимит ответов и срок — необязательны, срок только в будущем) и удаление с
подтверждением. Подсказка честно говорит: лимит и счётчик действуют только у форм «по
приглашению» — у остальных API ответы по ссылке не считает (ADR-0124).

**Consequences.** Ссылка строится от адреса, с которого открыта админка (`window.location.origin`).

## ADR-0151 — Участники события в админке

**Context.** В админке событий (ADR-0148) было видно только число участников; кто именно записался
— посмотреть было негде, эндпоинта не было.

**Decision.** `GET /admin/events/:id/participants` (право `events.view`) — участники по времени
записи: статус (идёт / интересуется / отказался) и только публичные поля пользователя
(`PUBLIC_USER_SELECT`), 404 для несуществующего события. В списке событий — кнопка «Участники»:
диалог с тегом (ссылка на карточку в админке) и статусом.

**Consequences.** Выгрузка участников и рассылка им — отдельными задачами.

## ADR-0152 — Формы: ответы не теряются при правке полей, «удаление» — архив

**Context.** Перед конструктором полей (7.4) аудит `PATCH /admin/forms/:id` показал: при переданных
`fields` API пересоздаёт все поля (`deleteMany` + `create`), а ответы на поля удаляются каскадом
(`FormFieldAnswer.field onDelete: Cascade`) — любая правка полей формы с ответами молча стирала
ответы игроков. Кроме того, `DELETE /admin/forms/:id` — это архивация (`ARCHIVED` + `deletedAt`,
ответы сохраняются), а админка (ADR-0149) предупреждала, что ответы удалятся, и предлагала
опубликовать архивную форму.

**Decision.** API: замена `fields` у формы, на которую есть хотя бы один ответ (включая
черновики), — 409 «сделайте копию формы и правьте её»; остальные настройки править можно. Web:
кнопка «В архив» вместо «Удалить», в подтверждении — «форма пропадёт с сайта, ответы (N)
сохранятся»; у архивных форм нет «Опубликовать» и «В архив». Исправляет формулировку ADR-0149 об
удалении ответов.

**Consequences.** Конструктор полей правит только формы без ответов; для формы с ответами — «Копия»
(черновик без ответов).

## ADR-0153 — Обращения: приоритет, обжалование наказания, переписка и история (этап 01, срез 1)

**Context.** MASTER-ROADMAP-2026 (этап 01) требует полноценную систему обращений. В коде уже были
создание, переписка, очередь, заметки, статус, вердикт и архив (ADR-0119, 0120, 0128, 0135). Не
хватало: привязки обжалования к конкретному наказанию, приоритета, фильтров очереди по приоритету и
ответственному, поиска, истории действий персонала, уведомлений; тип «Проблема с донатом» был скрыт
как hard gate; ответ игроку содержал служебные поля персонала.

**Decision.**

- Приоритет вычисляется сервером через `ReportPriorityProvider` (DI-токен
  `REPORT_PRIORITY_PROVIDER`): «Проблема с донатом», обжалование и жалоба на администрацию — HIGH,
  остальное — NORMAL. В БД не хранится; будущие Donation Entitlements (приоритетная поддержка
  Heracles, Poseidon, Zeus) подключаются заменой провайдера.
- Обжалование требует `appealedPunishmentId`: наказание автора, `isAppealable`, без другого открытого
  обжалования. Проверка и создание — в одной транзакции с `SELECT ... FOR UPDATE` строки наказания
  (без изменения схемы): параллельные обжалования одного наказания дают одно обращение и 409.
- Автор не пишет и не правит сообщения в обращениях RESOLVED, REJECTED, CLOSED и при `isLocked`;
  персонал пишет в закрытые обращения, если нет блокировки.
- Ответы игроку не содержат служебных полей персонала (`internalNote`, `assignedToId`, `lockedBy`,
  поля архива и удаления, `userId` целей, `uploadedBy` вложений) — Prisma `omit`.
- История действий — `GET /moderation/reports/:reportNumber/history` из `AuditLog`
  (`targetType='reports'`), без IP и User-Agent; срок хранения равен ретенции аудита.
- Ограничение злоупотреблений — по пользователю, в сервисе по данным БД (не по IP: до P3-02 IP за
  прокси общий, а глобальный throttler работает раньше авторизации): не более 5 обращений за
  10 минут (все типы) и не более 20 сообщений игрока за минуту; превышение — 429. Персонал не
  ограничен. Гонка на границе лимита допустима (антиспам, не учёт денег).
- Тип «Проблема с донатом» открыт в web как форма обращения (существующий
  `POST /reports/support/donation-problem`); покупки и платежи не затрагиваются.

**Consequences.** Сортировка по приоритету и приоритет по автору потребуют хранимого поля
(миграция — отдельное решение). Уведомление о смене статуса пока использует тип `REPORT_VERDICT`.
Вложения через RU-S3 — следующий срез (R3). История строится из `AuditLog` по `targetId`
обращения и может не включать действия с заметками и модерацию отдельных сообщений (их цель —
другая сущность). Правки сообщений по частоте отдельно не ограничены.

## ADR-0154 — Docker web: build-arg `NEXT_PUBLIC_TURNSTILE_SITE_KEY` и fail-fast (P3-04)

**Context.** `web.Dockerfile` и `docker-compose.prod.yml` передавали ключ под именем
`NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, а `apps/web/src/lib/env.ts` читает `NEXT_PUBLIC_TURNSTILE_SITE_KEY`:
в production-образе ключ был пуст.

**Decision.** Build-arg переименован. `docker-compose.prod.yml` использует
`${NEXT_PUBLIC_TURNSTILE_SITE_KEY:?...}`, а `web.Dockerfile` перед `next build` проверяет
`test -n` и падает с сообщением. Секретный `TURNSTILE_SECRET_KEY` во frontend/образ web не
встраивается.

**Consequences.** Сборка web без ключа невозможна; в CI/локально нужен публичный (в том числе
тестовый) ключ. Старое имя `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` больше не поддерживается.

## ADR-0155 — Политика TRUST_PROXY и клиентский IP (P3-02)

**Context.** За reverse proxy `req.ip` был адресом прокси: один злоумышленник блокировал вход всем
(brute-force по IP), глобальный throttler был общим, в `lastLoginIp`, сессии, audit и captcha писался
адрес прокси. Включение `trust proxy` «для всех» (`true`) позволило бы клиенту подделать IP любым
заголовком `X-Forwarded-For`.

**Decision.**

- `TRUST_PROXY` (env, валидируется при старте, `config/trust-proxy.ts`): пусто — выключено (по
  умолчанию); целое число hop-ов 1..10; `loopback`/`linklocal`/`uniquelocal`; список IP/CIDR через
  запятую. `true`, `*`, `-1`, `0` и мусор отвергаются — API не стартует с понятной ошибкой.
  CIDR шире IPv4 /8 и IPv6 /16 (в т.ч. `0.0.0.0/0`, `::/0` — «доверять всем») тоже отвергаются.
- `configureApp` вызывает `app.set('trust proxy', …)` и ставит ранний middleware, нормализующий
  `req.ip` (`::ffff:1.2.3.4` → `1.2.3.4`). Поэтому throttler (трекер = `req.ip`), audit, формы,
  `lastLoginIp`, сессии, captcha и регистрация получают один и тот же клиентский IP; ключи
  brute-force дополнительно нормализуются в `BruteForceService`.
- Express берёт адрес справа налево до первого недоверенного hop-а: левые элементы цепочки
  `X-Forwarded-For: подделка, клиент` игнорируются.
- Целевое значение для топологий nginx → api и Cloudflare → nginx → api (nginx с `real_ip`) —
  `TRUST_PROXY=1`. Топология production не подтверждена — открытый вопрос владельцу.
- SSR web → API (только чтение): серверные запросы web (`fetchPublic`, `apps/web/src/lib/seo.ts`)
  идут на `NEXT_PUBLIC_API_URL` (публичный адрес), заголовки клиента не пробрасываются, только
  публичные неавторизованные GET; авторизация и вход выполняются из браузера напрямую в API. На
  входы и brute-force SSR не влияет; при смене на внутренний адрес `req.ip` SSR будет адресом
  web-контейнера (допустимо, т. к. это не пользовательский IP).

**Consequences.**

- `infrastructure/docker-compose.prod.yml` задаёт `TRUST_PROXY: ${TRUST_PROXY:-1}`: незаданное или
  пустое значение в compose трактуется как `1`. nginx-пример перезаписывает заголовок
  (`proxy_set_header X-Forwarded-For $remote_addr`), а не дописывает; порт API публикуется только на
  127.0.0.1 и не должен быть доступен снаружи в обход nginx.
- ПЕРЕД ДЕПЛОЕМ проверить серверный `.env`: значение `TRUST_PROXY=true` теперь отвергается при старте
  API — заменить на `1` (или удалить строку). Иначе API не запустится.
- `uniquelocal` включает `fc00::/7` (весь ULA-диапазон, не только docker-сеть) — использовать
  осознанно; для топологии nginx → api достаточно `1`.
- `normalizeIp`: не-IP значение, слишком длинная строка (>64) → `unknown`; zone id срезается.
- Известные остаточные риски: (1) все клиенты без распознанного IP делят один ключ `unknown`
  (общий счётчик), предупреждение в лог намеренно не добавлено; (2) IPv6 не агрегируется по /64 —
  атакующий с подсетью /64 может обходить per-IP brute-force (отдельный тикет).
- Существующие записи с IP прокси в БД не переписываются.

## ADR-0156 — Безопасные cookie в production и fail-closed admin-2FA (P3-A1, P3-A2)

**Context.** Production мог стартовать с небезопасными cookie (`COOKIE_SECURE=false`,
`COOKIE_DOMAIN=localhost`) и без `TWO_FACTOR_ENCRYPTION_KEY`; при ключе короче 32 символов
`PermissionsGuard` молча отключал требование 2FA для админов. WS-модерация чата и поиск получателей
коммуникаций не проходили admin-2FA проверку.

**Decision.**

- Валидация env (Joi, `NODE_ENV=production`): `COOKIE_SECURE=true` обязателен; `COOKIE_DOMAIN`
  обязателен и не `localhost`/`127.0.0.1`/пустой; `TWO_FACTOR_ENCRYPTION_KEY` обязателен, ≥ 32.
  `COOKIE_SAMESITE=none` допустим только при `COOKIE_SECURE=true` во всех окружениях.
- `isAdmin2faDenied`/`assertAdmin2fa` (permissions.guard.ts) — единая проверка для HTTP-guard, WS
  gateway и контроллеров без `@RequirePermissions`. Без ключа: `NODE_ENV==='production'` и
  `requireAdmin2fa=true` — отказ всем (fail-closed); `NODE_ENV!=='production'` — требование не
  применяется (сохраняет поведение dev/test, где ключ не задан; осознанное исключение).
- WS: ошибка `error { event, message: 'admin_2fa_required: ...' }` (формат gateway), флаг 2FA
  читается из БД на действии.

**Consequences.**

- WS: admin-2FA также на `delete_message` в модераторской ветке (не автор, право
  `chat.messages.delete`): `ChatService.deleteMessage(..., beforeModerate)` вызывает проверку
  gateway после проверки права; автор, удаляющий своё сообщение, 2FA не проходит.
- `TWO_FACTOR_ENCRYPTION_KEY` обрезается (`trim`) в схеме и в guard; ключ из пробелов = отсутствует.
- Риск: `NODE_ENV` не задан -> схема берёт development, ключ не обязателен, guard пропускает
  admin-2FA без ключа. Смягчение: `NODE_ENV` НЕ делается обязательным; `docker-compose.prod.yml`
  задаёт `NODE_ENV: production`; при старте без ключа и `NODE_ENV !== 'production'` один раз пишется
  `Logger.warn` (admin-2FA не работает, допустимо только вне production). Допущение Chief,
  вопрос владельцу Q11.
- Отдельные тикеты (вне этого ADR): (1) аудит staff-хендлеров без admin-2FA (подозрение:
  `users.controller.ts:142`, `users.access_level.edit_self`); (2) `COOKIE_DOMAIN` с приватным IP
  (проходит валидацию); (3) кэш `requireAdmin2fa` 15 с — окно после включения/выключения флага.
- Допущение: e2e требований admin-2FA лежат в two-factor suite (глобальный флаг SiteSettings, запуск
  `--runInBand` отдельно).
- Деплой: без `COOKIE_SECURE`, `COOKIE_DOMAIN`, `TWO_FACTOR_ENCRYPTION_KEY` API не запустится.

## ADR-0157 — Платёжный вебхук: HMAC и сверка суммы (P3-01)

**Status:** Accepted (заменяет ADR-0034).

**Context.** Секрет в теле вебхука имел публичный дефолт `test-webhook-secret`, пустой секрет равен пустому,
проверка `PENDING` шла вне транзакции (двойной `usedCount`, 500 при повторе), сумма не сверялась,
`paymentId` перезаписывался, `:provider` игнорировался, `quick-buy` без throttle.

**Decision.**

- `PaymentProvider.verifyWebhook(rawBody, headers)` возвращает проверенное событие
  `{orderNumber, paymentId, status, amount, currency}` или `null`. Тестовый провайдер: HMAC-SHA256 hex над
  `timestamp.rawBody`, заголовки `x-twomc-signature`/`x-twomc-timestamp` (секунды), окно ±5 минут,
  `timingSafeEqual`; пустой секрет — всегда отказ. Секрет в теле не принимается.
- Сырое тело: `rawBody: true` через общую константу `APP_CREATE_OPTIONS` (main.ts и e2e).
- Провайдер выбирается по `:provider`: неизвестный — 404; неверная/отсутствующая подпись — 401. Проверенные
  события всегда дают 200 `{accepted, reason?}` (`order_not_found`, `provider_mismatch`, `payment_id_mismatch`,
  `currency_mismatch`, `amount_mismatch`, `already_processed`).
- Переход статуса — `updateMany where {id, status: PENDING}` в транзакции; `usedCount +1` и `promoCodeUsage`
  (`createMany skipDuplicates`, только для пользователей) — только если `count === 1`. Сумма — `Decimal.equals`
  с `order.total`; валюта задаётся провайдером (в `Order` поля нет; тестовый — `RUB`); `paymentId` не
  перезаписывается. Миграций нет.
- `TestPaymentProvider` — только при `NODE_ENV` in {development, test}. Дефолт `PAYMENT_WEBHOOK_SECRET` удалён
  (пусто = все вебхуки 401); e2e задают секрет сами. `@Throttle` 10/мин на `quick-buy`.

**Consequences.**

- Обязательность секрета в production — вместе с реальным провайдером (RISKS R2).
- `rawBody` увеличивает память на JSON-запросах (буфер тела хранится рядом с распарсенным).
- Throttle quick-buy считается по `req.ip` (корректен после P3-02).
- Риск порядка событий (`failed` раньше `succeeded` оставляет оплаченный заказ в `FAILED`) и требования к
  реальному провайдеру — RISKS R29; текущее поведение зафиксировано тестом.
- Отказы сверки (`provider_mismatch`, `payment_id_mismatch`, `currency_mismatch`, `amount_mismatch`)
  пишутся в `Logger.warn` только с id заказа, именем провайдера и причиной, без подписей, тела и сумм (P3-01b).
- Вне scope: реальный провайдер, доставка товаров, миграции.

## ADR-0158 — Безопасность deploy.sh и лимиты production-compose (P3-03a)

**Status:** Accepted. Решения владельца: Q18 (порядок деплоя и правило expand/contract) и Q20 (Redis `noeviction`),
ответы в `docs/agent-prompts/08-OWNER-ANSWERS-Q14-Q32.md`.

**Context.** `deploy.sh` применял `prisma migrate deploy` без снимка БД; откат возвращал только образы. В цепочке
`health && health` при `set -e` провал первой проверки не останавливал скрипт, печаталось ложное «Откат выполнен»
(DEP-02); `.release*` не игнорировались, и второй деплой упирался в «рабочая директория не чистая» (DEP-03); при
первом деплое автооткат был невозможен без сообщения (DEP-04); `docker image prune -f` не удаляет старые теги
(DEP-06); в compose не было лимитов памяти и ротации логов.

**Decision.**

- Порядок: build → `up postgres redis` → снимок БД (`pg_dump -Fc`, `umask 077`, каталог вне репозитория
  `PREDEPLOY_BACKUP_DIR`, проверка `pg_restore --list`) → `migrate deploy` → переключение → health → при провале
  откат образов. Провал снимка или миграции завершает деплой с кодом 1 до переключения приложений.
- Порядок «снимок → миграция → переключение → health» — ОТСТУПЛЕНИЕ от формулировки владельца «миграция после
  health-check»; владелец принял его (Q18(а)). Прежнее обоснование («Prisma client не стартует на старой схеме») неверно: Prisma не сверяет схему
  БД при старте приложения, а `/health` выполняет только `SELECT 1` и не проверяет таблицы и колонки. Миграция до
  переключения нужна по другой причине: health нового релиза имеет смысл только на схеме, которой этот релиз
  пользуется; при миграции после health новый код какое-то время обслуживал бы запросы на старой схеме и падал бы на
  первом обращении к новой колонке уже после «успешной» проверки. Безопасность обеспечивается правилом
  expand/contract: миграции обратно совместимы с предыдущим релизом, поэтому старый код работает на новой схеме, а
  автооткат образов возможен. Необратимые изменения — только из снимка и с одобрения владельца (runbook).
- Правило expand/contract обязательно (Q18(а)): каждая миграция обратно совместима с предыдущей версией кода.
  Сначала expand (новые таблицы, nullable-колонки или колонки с default, индексы), затем переключение кода на новую
  схему, contract (удаление, переименование, `NOT NULL`, смена типа) — отдельным следующим релизом, когда предыдущая
  версия кода уже не нужна для отката. Двухфазный деплой не вводится.
- Pre-flight: если есть `.release`, до снимка проверяется health текущего релиза; провал останавливает деплой (код 1).
  Обход для hotfix — `SKIP_PREFLIGHT=1` с предупреждением.
- Скан миграций: новые `migration.sql` между `.release` и `HEAD` проверяются на `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT`,
  `DROP INDEX`, `RENAME`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`, `TRUNCATE`; совпадение останавливает деплой до снимка. Обход — только
  `ALLOW_DESTRUCTIVE_MIGRATION=1` с одобрения владельца. Это эвристика (текстовый поиск), не доказательство
  совместимости; ревью миграций остаётся обязательным.
- Маркеры `.release` и `.release.prev` пишутся только после успешного health; повторный деплой того же sha не
  делает `.release.prev` равным текущему. `PREDEPLOY_BACKUP_KEEP` — целое не меньше 1, иначе выход до снимка;
  свежий снимок ротацией не удаляется.
- Health: `health_all` с явными `||`, ненулевой выход; «Откат образов выполнен» только после успешной проверки;
  отсутствие `.release.prev` — честное сообщение и код 1 (плохой релиз остаётся, нужен ручной шаг).
- `.release*` в `.gitignore`; хранится `KEEP_RELEASES` (3) последних тегов `twomc-api`/`twomc-web`, текущий и
  предыдущий защищены; `docker image prune -f` убран.
- Compose: `mem_limit` (postgres 1g, redis 256m, api 768m, web 768m, через env) и `json-file` `max-size` 10m /
  `max-file` 5 (через env) для всех сервисов. Redis: `--maxmemory` 192mb (`REDIS_MAXMEMORY`) и политика
  `noeviction`. Throttler хранит счётчики в памяти процесса API (`ThrottlerModule.forRoot` без storage,
  `apps/api/src/app.module.ts`), а НЕ в Redis. В Redis лежат счётчики brute-force, кеш прав, состояния 2FA и чат.
  `noeviction` — fail-closed: при заполнении запись завершается ошибкой, вход и проверка прав отвечают 500,
  обхода лимитов нет, но возможен DoS заполнением памяти. Redis не убивается по OOM (запас до `mem_limit` 256m
  оставлен под AOF-rewrite). Решение владельца Q20(а): `noeviction` принят. Отвергнутые альтернативы: `volatile-lru`
  (вытесняются только ключи с TTL; риск — потеря счётчиков brute-force и кеша прав под нагрузкой, что ослабляет
  защиту) и вариант без `maxmemory` (риск OOM-kill контейнера по `mem_limit`).
- Мониторинг памяти Redis (алерт, например, при более 80% `REDIS_MAXMEMORY`) — задача на момент появления сервера;
  сейчас не настроен, до этого остаётся риск DoS заполнением памяти.

**Consequences.**

- Допущение: сервер от 4 ГБ RAM (сумма лимитов ~2,75 ГБ); значения скорректировать при выборе хостинга (R8).
- Снимок увеличивает время деплоя и расходует диск (`PREDEPLOY_BACKUP_KEEP`, по умолчанию 7); вне сервера снимки
  не хранятся до P3-03b (бэкапы, шифрование, RU-S3).
- Откат схемы — ручной, из снимка, с потерей данных после снимка (runbook `docs/runbooks/deploy.md`).
- Вне scope: сборка образов в CI и registry (DEP-05, P3-03c), миграции, workflows.

## ADR-0159 — Бэкапы и восстановление PostgreSQL и uploads (P3-03b)

**Status:** Accepted (владелец, Q16 и Q19, 2026-11-17). Расписание и выбор RU-S3 провайдера остаются открытыми до появления сервера (R8).

**Context.** SEC-03: у `postgres-data`, `redis-data` и `uploads` нет копий вне сервера, восстановление не
отрепетировано; единственный снимок — перед миграцией (ADR-0158). Владелец принял RPO/RTO, age и срок хранения (Q16),
а также оставил защищённый `restore --target prod` (Q19); провайдер RU-S3 не выбран, сервера нет (R8), диск разработчика почти полон.

**Decision.**

- Решение владельца (Q16): RPO 24 ч плюс снимок (`BACKUP_TAG=predeploy`) перед каждым деплоем с миграциями, RTO 4 ч.
- Срок хранения (Q16, предложение агента принято): 7 ежедневных и 4 еженедельных копий. Выбор RU-S3 провайдера отложен.
- `infrastructure/backup/backup.sh`: `pg_dump -Fc` и `pg_dumpall --globals-only` через `docker compose exec -T`,
  архив uploads временным контейнером с томом `:ro`, `--network none`, `--read-only`, `--pull=never`; манифест
  (`MANIFEST.txt`), `PLAIN.sha256`, `SHA256SUMS`, проверка `pg_restore --list`. Каталог создаётся как `.partial`
  и переименовывается после успеха; `umask 077`; каталог вне репозитория.
- Шифрование по умолчанию обязательно (решение владельца, Q16): `age` публичным ключом (`AGE_RECIPIENT`), приватный ключ хранит владелец офлайн, на сервере его нет;
  gpg — альтернатива; `none` только с явным `BACKUP_ALLOW_UNENCRYPTED=1` (синтетика).
- Хранение: S3 опционально (`BACKUP_S3_RCLONE_REMOTE` либо `BACKUP_S3_URI` и `BACKUP_S3_ENDPOINT`), учётные данные
  вне скриптов; без S3 — локальный fallback с ротацией по меткам: `BACKUP_KEEP_DAILY`=7 (`scheduled`), `BACKUP_KEEP_WEEKLY`=4 (`weekly`, создаётся в воскресенье по UTC жёсткими ссылками на плановую копию), `BACKUP_KEEP_PREDEPLOY`=7 (метки не вытесняют друг друга; сбой `rm` при ротации даёт код 5, а при провале S3 остаётся 4). Провал выгрузки даёт код 4, локальная копия остаётся.
  Нехватка места на старте — код 3 и бэкап не начат.
- `restore.sh`: сначала sha256 хранимых файлов (несовпадение — отказ, код 2, ничего не изменено), затем расшифровка,
  sha256 открытого дампа, `pg_restore --list`, `pg_restore --clean --if-exists --single-transaction` (атомарно; `RESTORE_SINGLE_TRANSACTION=0` отключает; с `-j` несовместим, не используется). Цель по умолчанию — одноразовая БД
  drill; production только с `--target prod`: подтверждение вводом имени БД (TTY), без TTY нужны `RESTORE_CONFIRM=OVERWRITE-PRODUCTION` и `--non-interactive`; api должен быть остановлен; перед `--clean` обязательный снимок текущей БД (вне репозитория; шифруется age при `AGE_RECIPIENT`, иначе открытый с предупреждением и сроком 7 дней; ротация `RESTORE_SNAPSHOT_KEEP`=3; неудача — стоп). Владелец оставил защищённый `restore --target prod` (Q19, вариант «а»). `SHA256SUMS` защищает от повреждения, не от подмены; подпись — будущее.
- Redis не бэкапится: кеш и временные счётчики, refresh-сессии хранятся в Postgres.
- Restore-drill: проект `twomc-restore-drill`, порт `127.0.0.1:55432`, свои тома, без production `env_file`,
  синтетика через `psql`; пароль одноразовой БД задаёт оператор (`DRILL_POSTGRES_PASSWORD`).

**Consequences.**

- Открытый дамп до шифрования занимает диск: нужен запас не меньше размера БД и uploads (проверка `BACKUP_MIN_FREE_MB`).
- Drill не выполнен: время восстановления против RTO неизвестно; DoD P3-03b закрывается после drill.
- Значения по умолчанию `backup.sh` приведены к сроку 7+4 (7 ежедневных, 4 недельных, 7 `predeploy`; срок `predeploy` выбран агентом, владелец не уточнял). Логика ротации проверена стаб-тестом без БД и Docker; на реальном сервере не запускалась.
- Расписание не включено до появления сервера. `deploy.sh` пока использует собственный снимок; переход на
  `backup.sh` — отдельная задача.
- Бэкап на том же сервере не защищает от потери сервера: нужен вывоз копий (S3 или вручную).
- Вне scope: P3-03c (образы в CI и registry), миграции, workflows, восстановление реальных дампов с ПДн.

## ADR-0160 — Cloudflare real_ip и закрытие origin (P3-02b)

**Status:** Accepted как подготовка (владелец, Q4 и Q14, 2026-11-17): схема на сегодня не меняется, включение Cloudflare отложено до переноса DNS.

**Context.** ADR-0155 оставил топологию production открытой (nginx → api либо Cloudflare → nginx → api).
Владелец (ответ на Q4) попросил подготовить схему Cloudflare. Ответ на Q14 (2026-11-17): сейчас «nginx → api», DNS в Beget, Cloudflare не используется, `TRUST_PROXY=1`; Cloudflare планируется позже. Сервера пока нет (R8).

**Decision.**

- Решение владельца (Q14): production остаётся «nginx → api» (DNS в Beget, без Cloudflare); блок `set_real_ip_from` в
  `infrastructure/nginx.twomc.su.conf.example` и инструкция по файрволу остаются закомментированными до переноса DNS; в пример добавлены только комментарии и ссылка на runbook.
- Игровой адрес и порт Minecraft через Cloudflare не проксируются: отдельная DNS-запись DNS only (при необходимости SRV); проксируется только HTTP(S) сайта.
- Порядок включения при переносе DNS: файрвол origin (только диапазоны Cloudflare), затем раскомментировать `real_ip`, проверка `X-Forwarded-For`, Authenticated Origin Pulls (рекомендуется).
- Подготовлен `docs/runbooks/cloudflare-real-ip.md`: диапазоны Cloudflare (снимок 2026-11-16 из ips-v4 и ips-v6),
  `real_ip_header CF-Connecting-IP`, процедура обновления диапазонов, файрвол origin (ufw с `default deny incoming` и `IPV6=yes`, nftables; 80/443 только
  с Cloudflare), ограничение SSH, Authenticated Origin Pulls, проверки и откат. Authenticated Origin Pulls с общим
  сертификатом Cloudflare пропускает любую зону Cloudflare; привязка к своей зоне - только zone-level AOP с собственным
  сертификатом (рекомендуется). Список диапазонов проверяется (не `0.0.0.0/0`/`::/0`, IPv4 не шире /8, IPv6 не шире /12).
- `TRUST_PROXY=1` и `X-Forwarded-For $remote_addr` не меняются: хоп Cloudflare срезает nginx (real_ip), API видит
  один адрес клиента. Значение 2 не используется.
- `real_ip` включать только вместе с файрволом origin: иначе `CF-Connecting-IP` подделывается прямым запросом.
- Список диапазонов считается снимком; перед включением и далее регулярно его получают заново.

**Consequences.**

- Ничего не изменено на сервере и в коде; включение требует решения владельца о топологии.
- Устаревший список ломает либо доступ, либо определение IP: нужна регулярная проверка.
- Вне scope: покупка и настройка Cloudflare, DNS, WAF-правила, изменение apps/** и workflows.

## ADR-0161 — Обязательные production-переменные при старте API

**Status:** Proposed (допущение по D9; утверждается владельцем).

**Context.** В production captcha могла отключаться (`TURNSTILE_DISABLED=true`) и работала fail-open, а без `TRUST_PROXY`
rate limit и audit видели IP nginx вместо IP клиента. ADR-0156 уже сделал обязательными `COOKIE_SECURE=true`,
`COOKIE_DOMAIN` и `TWO_FACTOR_ENCRYPTION_KEY`. Пропуск любой из этих переменных на сервере давал небезопасный запуск без явной ошибки.

**Decision.**

- В `NODE_ENV=production` API не стартует (fail-fast в `apps/api/src/config/env.validation.ts`) без: `TRUST_PROXY`
  (непустой, число хопов), `TURNSTILE_SECRET_KEY`, `COOKIE_SECURE=true`, `COOKIE_DOMAIN` (не localhost),
  `TWO_FACTOR_ENCRYPTION_KEY` (не короче 32 символов), `DATABASE_URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`.
- `TURNSTILE_DISABLED=true` и `AUTH_TEST_OTP_ENABLED=true` в production запрещены (fail-closed).
- `infrastructure/docker-compose.prod.yml` требует `TRUST_PROXY` и `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`${VAR:?...}`): compose падает без значения.
- Чек-лист: `docs/runbooks/production-env-checklist.md`. Значения переменных в репозиторий не попадают;
  `TWO_FACTOR_ENCRYPTION_KEY` генерирует владелец у себя и не передаёт в чат, тикеты и логи.
- Dev/test поведение не меняется.

**Consequences.**

- Деплой без этих переменных не стартует; перед выкатом проверить `.env` на сервере.
- e2e с `NODE_ENV=production` и `TURNSTILE_DISABLED=true` перестанет работать; CI использует не production.
- Смена `TWO_FACTOR_ENCRYPTION_KEY` ломает включённую 2FA: только вместе со сбросом 2FA.
- Вне scope: создание ключей и аккаунтов Cloudflare, правка `.env` на сервере, деплой.

## ADR-0162 — Таймауты транзакции отправки формы (дополнение к ADR-0122)

**Status:** Proposed (допущение; утверждается владельцем).

**Context.** Отправка ответа (ADR-0122) идёт под `pg_advisory_xact_lock` по форме. При пачке параллельных отправок
запросы ждут блокировку, удерживая соединения пула; дефолтные 2 с `maxWait` на старт интерактивной транзакции Prisma
не хватает, и клиент получал 500. Тот же приём уже применён в `orders.service.ts` для вебхука оплаты.

**Decision.** `$transaction` в `FormsService.submitResponse` получает `{ maxWait: 5_000, timeout: 5_000 }`.
Логика блокировки и перепроверки лимитов не менялась. Выбран новый ADR, а не правка ADR-0122, чтобы не переписывать принятое решение.
Значения 5 с, а не 10 с: соединение пула под advisory lock удерживается до `timeout`, и 10 с на анонимном маршруте — слишком долгое удержание;
5 с достаточно для 5 параллельных отправок e2e (ADR-0122). `@Throttle` на маршрут отвергнут: `forms.e2e-spec.ts` шлёт с одного IP
22 отправки в минуту, что больше лимита 10/мин, а e2e не должен меняться. Альтернатива — `@Throttle` + `SkipThrottle`/сброс storage в e2e —
отложена до разрешения менять `test/**`. Допущение: `timeout` снижен вместе с `maxWait`.
Итоговые Consequences (ожидание до 5 с, e2e перед merge) обновлены в ветке `fix/q9-ipv6-64-rate-limit`, чтобы стек сливался без конфликта.

**Consequences.** Под нагрузкой запрос может ждать до 5 с вместо быстрой ошибки. e2e `forms.e2e-spec.ts`
не прогонялся (ресурсы); выполнить перед merge.

## ADR-0163 — Лимиты входа по подсети /64 для IPv6

**Status:** Accepted (ответ владельца на Q9, 2026-11-17: «лимиты входа по подсети /64 для IPv6, с тестами»).

**Context.** `bruteforce:*` ключи строились из полного IPv6-адреса (ADR-0155 оставил это как остаточный риск). Клиент с подсетью /64 имеет 2^64 адресов и обходит счётчик и блокировку сменой адреса.

**Decision.** В `apps/api/src/config/trust-proxy.ts` добавлена чистая функция `rateLimitKey(ip)`: IPv4 и IPv4-mapped IPv6 — IPv4; IPv6 — `v6:<h1>:<h2>:<h3>:<h4>` (первые 4 хекстета, нижний регистр, без ведущих нулей, без zone id); пусто/undefined — `unknown` (как `normalizeIp`); непустой мусор — `raw:` + 16 hex sha256 (не бросает, разные строки — разные ключи, не делит общий `unknown`). Применена к `BruteForceService` (`counterKey`/`blockedKey`), единой точке для логина и 2FA-входа. Журналы, аудит, `lastLoginIp`, согласия и `captcha.verify` по-прежнему получают полный адрес (`normalizeIp`). Глобальный `ThrottlerGuard` и per-route `@Throttle` не менялись (tracker по `req.ip`): осознанное консервативное решение, расширение на весь API требует отдельного решения.

**Consequences.**

- Одна подсеть /64 (типичный клиент) делит лимит, как клиенты за одним NAT; соседи в одной /64 у хостингов могут получить ложную блокировку.
- Старые Redis-ключи с полным IPv6 истекают сами (TTL 900 с); раздел «подозрительная активность» в админке показывает ключ как `v6:...`.
- Дополнение (ревью M1/L1): контроллеры передают в `RequestContext.rateLimitIp` СЫРОЕ `req.ip ?? remoteAddress` (`''`, если нет), сервис использует `rateLimitIp ?? ip` во всех вызовах `bruteForce.*` (логин и 2FA; social-auth лишь формирует контекст). `ip` (полный `normalizeIp`) остаётся для аудита/lastLoginIp/captcha. Иначе мусор схлопывался в `unknown` до ключа и делил один счётчик.
- Остаточный риск: пустой/undefined IP и литерал `unknown` дают общий ключ `unknown` (без IP нечем различать клиентов); это допущение, ADR-0155 не отменён.
- L1 закрыт: полная форма `0:0:0:0:0:ffff:c000:201` распознаётся как mapped IPv4 в `normalizeIp` (и значит в `rateLimitKey`).
- Throttler по-прежнему считает полный адрес: ротация адресов внутри /64 обходит только его, но не brute-force счётчик входа.
- e2e не выполнялся (диск), выполнить перед merge.
- Статус на 2026-11-17: пункты этого ADR о глобальном throttler (tracker по `req.ip`, «считает полный адрес») уточнены ADR-0177; текст выше сохранён как исторический.

## ADR-0164 — NODE_ENV fail-closed: пустой NODE_ENV = production

**Status:** Accepted (решение владельца по аудиту Q11, 2026-11-17: «пустой/не заданный NODE_ENV = production»).

**Context.** Схема env подставляла `NODE_ENV=development`, если переменная не задана; проверки `=== 'production'` (обязательные TRUST_PROXY/cookie/2FA-ключ/Turnstile, запрет тестового OTP, admin-2FA без ключа, https в CORS, отказ при ошибке почты) молча выключались на сервере с забытым NODE_ENV.

**Decision.** Новый хелпер `isProductionLike(nodeEnv)` (`apps/api/src/config/node-env.ts`): false только для явных `development` и `test` (без учёта регистра и пробелов), всё остальное (undefined, пусто, production и любые другие значения) даёт true. Схема env (Joi) принимает NODE_ENV только `development`, `test`, `production` или пустое значение; `staging`, `Production` и любые другие значения роняют старт API с ошибкой валидации (тоже fail-closed). Применён в `env.validation.ts` (условие Joi «явно development/test», `.required()`, иначе действует production-набор; `.default('development')` убран, пустая строка допустима, значения схемы прежние), `permissions.guard.ts` (admin-2FA и предупреждение), `test-otp.ts`, `cors.ts`, `email.service.ts` (коды из писем в debug-лог только вне production-like), `registration.service.ts` (отказ при ошибке отправки письма с кодом). Уже fail-closed и не менялись: `auth.service.register` (`!== 'test'`), `payment-provider.registry` (белый список development/test); проверки `=== 'test'` (планировщики, email, files) остаются: они отключают побочные эффекты только в Jest. Скрипты `start:dev` и `start:debug` api запускаются через `apps/api/scripts/with-node-env.mjs development ...` (кроссплатформенно, без новых зависимостей). `start` (`nest start`) NODE_ENV больше не задаёт: без переменной он fail-closed (production), `start:prod` не менялся.

**Consequences.**

- Локальный запуск без обёртки (например, `nest start` напрямую или `node dist/main` без `.env` с NODE_ENV) теперь требует production-переменные; для dev в `.env` или через скрипты нужен явный `NODE_ENV=development`.
- Jest сам выставляет `NODE_ENV=test`, CI (`pnpm test`, `test:e2e`, `build`) не затронут; шаг CI «Prisma seed» запускает seed вне Nest, и `prisma/seed/bootstrap.ts` по-прежнему сравнивает `=== 'production'` (вне scope, отдельная находка).
- Значение `staging` и прочие неизвестные значения NODE_ENV не принимаются схемой env (старт падает); промежуточные окружения запускать с `NODE_ENV=production`, им нужны все production-переменные.

## ADR-0165 — Обращения: исполнитель списком, заметки, история игрока, фильтры (этап 01, срез 2)

**Status:** Accepted частично (2026-11-17). Дополняет ADR-0153 (срез 1), не отменяет его. Отдельный тип уведомления `REPORT_STATUS_CHANGED` не реализован: требует схемы, ждёт решения владельца. Вложения не делались (R3).

**Context.** По ADR-0153 и разделу 3 `docs/agent-prompts/04-STAGE-00-01-02-AUTONOMOUS.md` в срезе 2 нужны: выбор исполнителя списком, правка и закрепление заметок, признак «сотрудник» вместо id, подстановка наказания через `?punishment=ID`, фильтры статуса и типа у игрока, история действий, отдельный тип уведомления о смене статуса. Ветка `feature/support-slice-2` создана от `fix/q11-staff-hierarchy-node-env` @ ba36944 (допущение: `main` не содержит среза 1).

**Decision.**

- Выбор исполнителя: `GET /moderation/reports/assignable-staff?q&limit`, право `reports.assign`, ответ `{items:[{id,username,tag,avatar}]}`; в web combobox. Список читает роли и баны из БД напрямую, не из кеша прав (TTL 300 с); `assign` перепроверяет `reports.view`.
- Заметки: `PATCH /moderation/reports/:n/notes/:noteId {content}` (право `reports.notes` и либо автор, либо `reports.delete`); `PATCH .../pin {pinned?}` и `DELETE .../pin` (право `reports.notes.pin`); закреплённые идут первыми. Право правки чужих заметок = существующее `reports.delete`, потому что новые permission требуют seed. Снятие закрепления по `reports.notes.pin` (`reports.notes.unpin` в каталоге нет). В web закрепление идёт через PATCH с `pinned`.
- Игроку у сообщений персонала `authorId=null`, `isStaff=true`; в web бейдж «Сотрудник».
- История для игрока: `GET /reports/:reportNumber/history?page&limit` -> `{items:[{id,kind,status|null,createdAt}],total,page,limit}`, `kind` = `STATUS_CHANGED` | `VERDICT` | `CREATED`. Доступ только автору (чужому 403, несуществующее 404). Без актора, ip, заметок и id сотрудников. `CREATED` синтетическое, по `createdAt` обращения. История персонала не менялась (события заметок уже попадают в аудит, тест `report-audit-target.spec.ts`). В web блок «История» с «Показать ещё»; тип истории локальный в `apps/web` `lib/support/hooks.ts`; неизвестные `kind`/`status` показываются как «Событие».
- Web игрока: `?punishment=ID` подставляет наказание (невалидный ID игнорируется с подсказкой); фильтры status/type (backend был в срезе 1) в URL query со сбросом и пустым состоянием, нативные `select`.
- Вложения не делаются: заглушка «Вложения скоро будут доступны» без моков; нужно российское S3 (риск R3).

**Не принято (ждёт решения владельца).** Тип уведомления `REPORT_STATUS_CHANGED`. Проект: миграция `ALTER TYPE "NotificationType" ADD VALUE 'REPORT_STATUS_CHANGED';` (`schema.prisma` ~:1424); в `changeStatus` (`reports-moderation.service.ts` ~:195) заменить `REPORT_VERDICT` на новое значение, `setVerdict` без изменений; в web/notifications добавить иконку, подпись и маршрут (и список типов в shared, если есть). До решения смена статуса шлёт `REPORT_VERDICT` с заголовком «Статус обращения … изменён».

**Consequences.**

- DELETE заметки требует только `reports.notes` без проверки автора (асимметрия с PATCH).
- e2e `apps/api/test/reports-support.e2e-spec.ts` написаны, но не запускались (прогон отложен: ОЗУ, нужна команда владельца).
- Независимое ревью backend не проводилось; ревью web (twomc-reviewer) блокеров не нашло, 4 minor учтены в 2528d5b.
- Suspense вокруг `useSearchParams` проверен только чтением, `next build` не запускался.
- Если решение по `reports.delete` изменится на отдельное право, понадобится seed.

## ADR-0166 — Наказания в реальном времени: чтение БД LiteBans через адаптер PunishmentSource (этап 02, дизайн)

**Status:** Accepted-by-owner по Q29 и Q31 (2026-11-17); реализация по очереди работ, установка `mysql2` после освобождения диска (P3-06a). Остальные вопросы раздела 11 документа (О1-О5) открыты.

**Context.** Решение владельца (промпт 04, раздел 9): плагин наказаний — LiteBans, источник — прямое чтение его БД, только SELECT, отдельным пользователем, без записи. Нужны реальное время, первичная синхронизация, сверка и замена источника на TwoMC Bridge (этап 03). Схема взята из официальной wiki LiteBans (версия 2.11.1, 2023) и требует сверки по боевой БД.

**Decision.** Полный дизайн — `docs/stage-02/LITEBANS-INTEGRATION-DESIGN.md`. Главное:

- Адаптер `PunishmentSource` не знает про LiteBans, write-методов нет; гарантия «только чтение» — столбцовые права SELECT без `ip`, read-only транзакции, константные SQL без `SELECT *`.
- Статус наказания вычисляется по `until` и `removed_by_*`, не по `active` (LiteBans обновляет его раз в ~20 часов и не шлёт события об истечении).
- Синхронизация слоями: опрос новых строк по `id` с перекрытием (1–2 с), сверка активных (15 с), полная сверка (60 мин), таймер истечения на сайте. Изменения и удаления задним числом (`--modify`, `--delete`, prune) водяной знак по `id` не видит.
- WebSocket namespace `/punishments`: комнаты `public`, `user:{id}`, `staff`; публичные события по белому списку полей; выдавший скрыт по умолчанию, публичный раздел выключен по умолчанию.
- Обжалование: nullable `Report.appealedMinecraftPunishmentId` на зеркальную таблицу, потому что `UserPunishment.issuedBy` обязателен.
- H2 прямым чтением не поддерживается; единственный драйвер первой реализации — MySQL (`mysql2`, зависимость разрешена владельцем, Q29, Q31 п. 1).
- Решения владельца Q31: пользователя БД с SELECT только на `litebans_*` создаёт владелец (пароль агенту не передаётся); сеть и TLS владелец настраивает по `docs/runbooks/litebans-db-access.md`; миграции зеркальных таблиц по Q28 (одноразовая локальная БД, ревью expand/contract, production применяет владелец); публично на `/bans` ник, тип, причина, даты, активность; выдавший скрыт по умолчанию; IP и любые контактные данные не показываются никогда (причина всегда очищается от IP, e-mail, телефонов, URL и контактов); юридическую оценку 152-ФЗ владелец ведёт отдельно, реализацию она не блокирует.

**Consequences.**

- Блокеры Q29 и Q31 сняты решениями владельца (драйвер, миграции по Q28, пользователь БД, сеть и TLS, политика публичности). Остаются условия: освободить диск (P3-06a), выполнить сверку схемы по реальной БД и открытые вопросы О1-О5 раздела 11.
- Схема PostgreSQL, типы `bit(1)`, UUID онлайн/оффлайн и заполнение `removed_by_*` требуют сверки по реальной БД.
- Нет Redis-адаптера Socket.IO: до решения один экземпляр API.
- Публикация ников — персональные данные; юридическую оценку 152-ФЗ владелец записывает отдельно (Q31), реализацию она не блокирует. UUID не публикуется.

## ADR-0167 — Контракт TwoMC Bridge v1: плагин → сайт по HTTPS с HMAC (этап 03, дизайн)

**Status:** Accepted-by-owner по Q32 (2026-11-17) для платформы, ключей, миграций и данных игроков; прокси и число серверов открыты (Q42); только документ, кода, плагина, миграций и ключей нет.

**Context.** Промпт 06 (п. E) и промпт 07 (п. G): этап 03 — подготовка контракта Bridge без боевого плагина и без предположений о ядре сервера. Адаптер наказаний этапа 02 (`PunishmentSource`, ADR-0166) должен заменяться источником Bridge.

**Decision.** Полный контракт — `docs/stage-03/BRIDGE-CONTRACT.md`. Главное:

- Транспорт v1 — HTTPS-вебхуки плагин → сайт (`/bridge/v1`: `handshake`, `events`, `punishments/snapshot`); команды сайт → сервер в v1 запрещены.
- Подпись HMAC-SHA256 над сырым телом и канонической строкой (версия протокола, `key-id`, метод, путь, время, nonce); окно ±60 с, nonce против повтора; эталонный тестовый вектор в документе (ключ явно тестовый).
- Ключ на сервер, ротация; секреты создаёт владелец (Q32: HKDF от мастер-секрета).
- Идемпотентность по `eventId`, порядок по `streamId`/`seq`, повторная доставка, backpressure через `429` и `Retry-After`, лимиты пачки (100 событий, 256 КБ).
- Типы v1: наказания, вход и выход игрока; статистика и инвентарь — «будущие» (этапы 04, 10); экономика и донат-валюта не включены (hard gate).
- Приёмник на сайте и таблицы `bridge_servers`, `bridge_event_log` — только текстом; миграции по Q28 (одноразовая локальная БД, ревью expand/contract, production применяет владелец).
- Симулятор плагина — дизайн, явно тестовый, без моков в продуктовом коде.

**Update 2026-11-17 (Q32).** Платформа: ядро UniverseSpigot 1.21.4 (Spigot API `1.21.4-R0.1-SNAPSHOT`, Minecraft 1.21.4), Java не ниже 21 (точную версию на хосте уточнит владелец); плагин TwoMC Bridge пишется под стандартный Spigot API, это форк, поведение проверять на реальном сервере; плагин пишет агент позже, после ответов владельца. Ключи серверов создаёт владелец (HKDF от мастер-секрета, ротация). Миграции `bridge_servers` и `bridge_event_log` по Q28. Данные игроков: вход и выход да (типы `player.*`), IP нет; чат отдельным решением позже. Открыто: Q42 (прокси Velocity или BungeeCord и количество серверов). Номер этапа инвентаря («этап 10») не менялся: открыт Q33. Следующие пункты Consequences ниже частично устарели: вопросы про ядро, ключи, миграции Q28 и вход/выход этим обновлением решены.

**Update 2026-11-17 (Q35, ревизия после независимого ревью).** Ответ владельца: снимок инвентаря делится на части (чанки) по группам слотов с общим `snapshotId`, номером части `part` (нумерация с 1) и числом частей `parts`; сайт собирает снимок из частей, применяет только полный комплект и отбрасывает неполный по таймауту; лимит одного события Bridge (16 КБ) НЕ повышается; тесты на потерю и повтор частей обязательны. Контракт, раздел 6.1:

- Раскладка — закрытый перечень: `main` 4 части (`hotbar`, `storage_a`, `storage_b`, `equipment`) или 1 (`all`), `ender` 2 части (`ender_a`, `ender_b`) или 1; полнота сверяется с набором `slotGroup` для `group`, частей не больше 4 (прежний предел 8 снят, деление группы дальше запрещено). `snapshotId` проверяется регуляркой `^[0-9A-Za-z-]{26,64}$`, `slotGroup` и `parts` — до обращения к Redis.
- Идемпотентность по `eventId` и `(snapshotId, part)`, любой порядок прихода, несовпадение `parts` или заголовков — `snapshot_mismatch` (неисправимый код, добавлен в 5.1).
- Один порядок свежести: сначала `epoch`, затем `rev`; `capturedAt` служит только отсечкой просрочки. Причина: после перезапуска плагина `epoch` новее всегда, а сравнение по `capturedAt` отбросило бы снимок новой эпохи как `stale` при уходе часов назад.
- Таймаут неполного комплекта 120 с от первой части по часам приёмника (Допущение до подтверждения владельцем (Q61)). Отсечка по `capturedAt` 150 с (Допущение до подтверждения владельцем (Q61)) действует только для части, создающей новую сборку; части живой сборки по `capturedAt` не отсекаются. Более свежий полный комплект заменяет неполный.
- Повтор завершающей части после сбоя БД (находка ревью HIGH): выбран вариант «а». Сборка имеет состояния «собирается», «полна, не применена», «применена» (метка `done`, 300 с; прежние 24 часа заменены в раунде 2, см. ниже); повтор части полного комплекта без метки `done` берёт захват (токен, TTL 30 с) и запускает применение, а не получает `duplicate`; при сбое БД ответ `503`, буфер сохраняется, захват снимается. Дедупликация `eventId` завершающей части записывается только после успешного применения (вариант «б» как следствие); одного «б» мало, потому что плагин вправе повторить часть под новым `eventId`. Применение идемпотентно по `snapshotId`.
- Буфер в Redis с TTL (общий для экземпляров API); ключи с хэш-тегом `{serverId}` (совместимость с Redis Cluster), ключ индекса игрока строится из внутреннего идентификатора пользователя, а не из открытого UUID; лимиты 256 сборок и 8 МБ на сервер, снимок до 32 КБ (Допущение до подтверждения владельцем (Q61)); на `(игрок, group)` не более 2 сборок, при третьей вытесняется самая старая по `firstSeenAt`; 6 снимков в минуту на игрока (Допущение до подтверждения владельцем (Q61)) считаются при создании сборки, части существующей сборки не отклоняются, дельты считаются отдельным счётчиком.
- Метрики и ответы приёмника (`part_buffered`, `snapshot_applied`, `resync_required`); тест-векторы 1–12 (потеря, повтор, обратный порядок, разное `parts`, сбой БД и повтор, возобновление после истечения, `done` после `stale`, новая эпоха, счёт лимитов, вытеснение, проверки до Redis).

Тип `inventory.snapshot` остаётся будущим, номер этапа инвентаря («этап 10») не менялся: Q33 открыт. Параметры сборки (числа с пометкой Q61) владельцем не названы и подтверждаются отдельным ответом.

**Update 2026-11-17 (Q35, раунд исправлений 2).** Контракт 6.1 и 5.2 по находкам ревью (только документ):

- Единый TTL: метки `done`, `mark` и дедупликация `eventId` частей снимка — 300 с вместо 24 часов (исключение из общего правила 5.2; Допущение до подтверждения владельцем (Q61); в раунде 3 значение выводится из таймаута сборки, 300 с остаётся значением по умолчанию, см. ниже). Повтор части после окна не создаёт дубль: дедупликация применённых снимков идёт по `(epoch, rev)` и `snapshotId` в транзакции БД, а часть старше 150 с по `capturedAt` получает `resync_required`; окно 300 с покрывает отсечку 150 с и расхождение часов 60 с.
- Верхние границы: `epoch` не больше now + 7 суток (в единицах формата эпохи; СУЖЕНО до now + 10 минут в раунде 3, см. ниже), `rev` не больше 2^31 - 1; нарушение — `rejected invalid_data` без записи. Админ-операция сброса рядов сервера (персонал по отдельному праву, 2FA, аудит) описана в дизайне этапа 04 (4.5), реализации нет.
- Политика памяти Redis: при старте проверяется `maxmemory-policy`; не `noeviction` или проверка недоступна (managed Redis) — сборка снимков fail-closed (`resync_required`, тревога), остальные функции Bridge работают (в раунде 3 то же для `maxmemory = 0` и проверка при каждом переподключении, см. ниже).
- Единый порядок проверок части П0–П6 (правило 9), финиш при чужом захвате и при истёкшей сборке (правило 7), перепроверка привязки UUID при применении, тест-векторы 13–16.

**Update 2026-11-17 (Q35, раунд исправлений 3).** Допущения до ответов владельца на Q61 и Q62; только документ, контракт 6.1, 5.1, 5.2, 13.1:

- Граница эпохи (H1): `epoch` не дальше now + 10 минут (было 7 суток; окно отравления ряда эпохой из будущего сужено с недели до минут); нарушение — `rejected epoch_out_of_range` (новый неисправимый код). Сайт хранит `maxSeenEpoch` на сервер и поднимает тревогу при опережении часов приёмника больше 120 с (порог = окно подписи 60 с плюс запас 60 с; сравнение с приростом `maxSeenEpoch` непригодно, так как между законными эпохами проходят дни). Экстренный сброс рядов сервера в порядке: (1) блокировка сервера или отзыв ключа (`bridge_servers`, ключ ротирует владелец), (2) барьер: нет захватов и применений в полёте, (3) очистка рядов, буфера и `maxSeenEpoch`, (4) разблокировка. Плагин после отклонённой эпохи не повторяет вслепую и не поднимает эпоху сам, переходит в безопасный режим инвентаря (наказания и `player.*` работают), шлёт alert, возобновляет инвентарь только после подтверждения оператора пробным снимком.
- `maxmemory = 0` (M1): одно поведение с вытесняющей политикой — буфер fail-closed (`resync_required`, тревога); политика и предел перечитываются при каждом переподключении к Redis (раньше «предупреждение без отказа»).
- TTL служебных ключей (M3): `TTLsvc = max(300, ceil10(1,4 × (T + 90)))` от таймаута сборки `T` (при 120 с — 300 с, при 600 с — 970 с), запуск с `TTLsvc < T + 90` отклоняется, окно повтора не возвращается. Учёт `svc` в лимитах ведётся с запасом (256 байт на ключ), а не по фактическому размеру: `MEMORY USAGE` недоступен в атомарном скрипте и части managed Redis.
- Построчный отказ (M5): отказы только по инвентарю (сбой БД на применении, сбой или лимит времени буфера, чужой захват) — построчный `rejected inventory_unavailable` вместо `503` на пачку; `punishment.*` обрабатываются первыми и не блокируются ни ответом, ни паузой плагина; метки `evt` и `done` при таком отказе не пишутся. `503` остаётся только для ошибок уровня запроса (Redis недоступен для нонса, приёмник выключен).
- Открытые пункты к реализации среза 1 (раздел 13.1): M2 окно проверки политики Redis при failover; M6 детали админ-сброса (право, свежая 2FA, причина); LOW: порядок П3 и П4, флуд аудита, Redis Cluster, расхождение ссылок между ветками. Вопросы владельцу: Q61 (параметры сборки), Q62 (граница эпохи и экстренный сброс).

**Consequences.**

- Реализация заблокирована решениями владельца: кто пишет плагин и на каком ядре, ключи, миграции (Q28), приватность данных игроков (152-ФЗ).
- Открытые пункты security-ревью дизайна (раздел 13 документа): Redis с AOF или принятие окна повтора, ограничения `capabilities`, пометка источников не LiteBans, приватность `player.*`.

## ADR-0168 — Инвентарь Minecraft на сайте: данные через Bridge, приватность по умолчанию (этап 04, дизайн)

**Status:** Proposed (только документ; кода, миграций, Prisma-схемы и ключей нет).

**Context.** Дорожная карта, этап 04: просмотр инвентаря Minecraft (основной, броня, вторая рука, Ender Chest, зачарования, время обновления, offline, публичный и приватный режим, чужой инвентарь только по праву, иконки включая ItemsAdder). Данные доступны только через Bridge (ADR-0167), где `inventory.*` — «будущие» типы. Права Apollo+, Ares+, Poseidon+, Zeus относятся к Donation Privileges (hard gate).

**Decision.** Полный дизайн — `docs/stage-04/INVENTORY-SITE-DESIGN.md`. Главное:

- Предложение к контракту Bridge v1.x: `inventory.snapshot` (полное состояние группы `main` или `ender`) и `inventory.delta` (по `epoch` и `baseRev`, при расхождении `resync_required`); нормализованный JSON предмета, текст — плоские «прогоны», без сырого NBT, текста книг, ников и UUID внутри предметов, без вложенного содержимого контейнеров.
- Хранение: один ряд на (пользователь, сервер, группа), только последнее состояние, хэш содержимого для дедупликации; данные принимаются только для привязанных UUID (`MinecraftAccount`); история не хранится по умолчанию; приватность в отдельной модели, по умолчанию «приватно», Ender Chest скрыт.
- Доступ решает одна серверная функция до чтения данных: владелец; чужой — только при `canViewProfile` и публичном флаге; Ender Chest и основной инвентарь — разные маршруты; персонал — отдельные админ-маршруты, права `inventory.view_any` и `inventory.view_ender_any` (имена предложены), admin-2FA, запись в аудит; `404` одинаков для «нет пользователя» и «нет привязки», `Cache-Control: private`, без общего кэша.
- Донат-правила не проектируются: только интерфейс `InventoryEntitlementPolicy` с решением по умолчанию; реализация — этап 05 после решения владельца.
- Иконки: реестр, атлас и манифест на CDN, запасная иконка; источник и лицензия ванильных текстур — вопрос владельца; ассеты агент не создаёт.
- Site Cosmetics Inventory: только границы; всё, что зависит от экономики, магазина и доната, — hard gate.

**Update 2026-11-17 (Q35).** Ответ владельца: снимок инвентаря делится на части (чанки) по группам слотов с общим `snapshotId`, номером части (с 1) и числом частей; сайт собирает снимок из частей, применяет только полный комплект и отбрасывает неполный по таймауту; лимит события Bridge (16 КБ) не поднимается; тесты на потерю и повтор частей обязательны. Дизайн сайта (разделы 3.6, 4.4): буфер сборки в Redis с TTL (общий для экземпляров API, не БД), таймаут 120 с (Допущение до подтверждения владельцем (Q61); согласовано с контрактом `BRIDGE-CONTRACT.md`, 6.1), атомарная проверка полноты и захват применения (один обработчик, захват 30 с), идемпотентность по `eventId` и `(snapshotId, part)`, лимиты 256 сборок и 8 МБ на сервер и 2 сборки на игрока и группу (Допущение до подтверждения владельцем (Q61)). Следствие: лимит хранимого ряда группы повышен с 24 КБ до 32 КБ (полная группа 41 слот × 600 байт = 24 600 байт плюс служебные поля; Допущение до подтверждения владельцем (Q61)). Вопрос Q35 отвечен; номер этапа инвентаря (Q33) не менялся.

**Update 2026-11-17 (независимое ревью Q35, дизайн сайта).** Закрыты находки ревью (согласовано с контрактом, `BRIDGE-CONTRACT.md`, 6.1):

- Повтор завершающей части после сбоя БД не теряет снимок (вариант «а»): три состояния сборки (собирается; полна, не применена; применена с меткой `done`); повтор части полного комплекта без `done` берёт захват (токен, 30 с) и запускает применение; дедупликация `eventId` завершающей части пишется только после успеха; при сбое БД — `503`, буфер и части сохраняются. Тест «сбой БД -> 503 -> повтор -> снимок применён» обязателен (раздел 11).
- Память Redis: введён общий потолок буфера и всех служебных ключей — 20 МБ на сервер (сборки 8 МБ + служебные 12 МБ) и 64 МБ глобально (Допущение до подтверждения владельцем (Q61)); приложение проверяет потолок само, отказ — `resync_required` по событию снимка, а не `503` всего запроса и не OOM Redis; `done` и дедупликация `eventId` частей — 300 с вместо 24 часов (хватает на повторы плагина, отсечка 150 с плюс 60 с расхождения часов; 24 часа давали до сотен МБ ключей вне лимитов; Допущение до подтверждения владельцем (Q61)); для дельт ключей `eventId` нет. Допущение развёртывания: общий Redis с жёстким `maxmemory`; рекомендация — отдельный экземпляр (логическая БД память не изолирует), решение владельца (Q61).
- Лимит «6 в минуту» — это 6 СНИМКОВ (Допущение до подтверждения владельцем (Q61)): считается при создании сборки по новому `snapshotId`, части существующей сборки не отклоняются; дельты — отдельный счётчик по событиям (30 в минуту на игрока, Допущение до подтверждения владельцем (Q61)).
- Один порядок свежести везде, включая SQL: сначала `epoch` (целое, `BigInt`), затем `rev`; `capturedAt` — только отсечка просрочки и показ. Причина: после перезапуска плагина часы хоста могут уйти назад, и сравнение по `capturedAt` отбросило бы снимок новой эпохи как `stale`.
- Отсечка 150 с по `capturedAt` — только для первой части, создающей сборку; части живой сборки не отсекаются (их срок определяет таймаут 120 с).
- Схема события 3.2 дополнена `snapshotId` (регулярка `^[0-9A-Za-z-]{26,64}$`, проверка до Redis), `part`, `parts`, `slotGroup`; закрытый перечень раскладок (`main`: 4 части или 1 `all`; `ender`: 2 или 1; `parts` не больше 4), полнота по набору `slotGroup`; ключи игрока — от внутреннего `userId`, хэш-тег `{serverId}` (без хэш-тега — Redis без кластера); вытеснение самой старой сборки по `firstSeenAt`.

**Update 2026-11-17 (ревью раунда 2, M1–M4, L; согласовано с `BRIDGE-CONTRACT.md`, 5.2 и 6.1).** Все значения — Допущение до подтверждения владельцем (Q61):

- M3, единый TTL: `done`, `evt` и `mark` живут одно и то же время (в раунде 2 — 300 с; с раунда 3 выводится из таймаута, см. ниже; метка `mark` была 150 с, короче окна 210 с: 150 с отсечки + 60 с опережения часов). Это исключение из общего правила 24 часов (Bridge 5.2). Повтор после окна не даёт дубля: получает `resync_required` (часть старше 150 с) или `stale`, потому что дедупликация применённых снимков идёт по `(epoch, rev)` и `snapshotId` в транзакции БД.
- M1, границы: `epoch` не больше «сейчас приёмника + 7 суток» (в раунде 3 сужено до 10 минут, см. ниже), `rev` не больше 2^31 - 1; нарушение — `rejected invalid_data` (код Bridge 5.1) до Redis и БД, без записи. Остаточный риск в окне 7 суток лечит админ-сброс рядов сервера (персонал, отдельное право, 2FA, аудит; только описание, вопрос Q62).
- M2, глобальный потолок 64 МБ: учёт по серверам с истечением (простаивающий сервер освобождает долю), лимит сервера не больше `min(20 МБ, 64 МБ / N)` (в раунде 3 формула уточнена: `floor`, не более 64 серверов, см. ниже); гарантия «один сервер не вытеснит остальных» ограничена: доступ к памяти, уже занятой другими, не гарантирован до её истечения (не более 300 с).
- M4, политика Redis: при старте и по таймеру проверяется `maxmemory-policy`; не `noeviction` или `CONFIG GET` недоступен — сборка снимков fail-closed (`resync_required`, тревога), остальные типы событий работают.
- L: единый порядок проверок П0–П6; финиш при чужом `lock` (`lock_lost`, `503`, без записи `done`) и при истёкшей сборке (`done` и `evt` пишутся); гонка первой вставки закрыта `INSERT ... ON CONFLICT ... RETURNING`; привязка `userId` перепроверяется при применении (сборка живёт до 120 с). Тесты — раздел 11 дизайна.

**Update 2026-11-17 (ревью раунда 3, H1, H2, M1, M3, M4; согласовано с `BRIDGE-CONTRACT.md`, 5.2 и 6.1, ADR-0167).** Все значения — допущение до подтверждения владельцем (Q61, Q62); код не пишется:

- H1, отравление рядов эпохой: граница `epoch` сужена с 7 суток до «сейчас приёмника + 10 минут» (`now_ms + 600 000`; 10 минут = расхождение часов 60 с по окну подписи плюс запас на хосты без NTP); нарушение — `rejected epoch_out_of_range` (неисправимый код), без записи в Redis, БД и дедупликацию. Сайт хранит `maxSeenEpoch` на сервер и поднимает тревогу при опережении часов больше 120 с (60 с расхождения плюс 60 с запас на NTP; сравнение «с прошлым максимумом» непригодно, между эпохами проходят дни). Экстренный сброс (дизайн 4.5): (1) заблокировать сервер или отозвать ключ (`bridge_servers`, ротация ключа владельцем), (2) дождаться барьера (нет `lock` и применений в полёте), (3) очистить ряды сервера, буфер и `maxSeenEpoch`, (4) разблокировать. Плагин после отклонённой эпохи или трёх `stale` подряд не повторяет и не поднимает эпоху сам, уходит в безопасный режим инвентаря, возобновляется по подтверждению оператора одним пробным снимком.
- H2, отвязка UUID: при применении снимка строка привязки читается в той же транзакции с `FOR SHARE`; все пути отвязки (пользователь сам, администратор, удаление аккаунта каскадом, смена привязки) берут `FOR UPDATE` и удаляют ряды инвентаря в той же транзакции; порядок блокировок один (привязка, затем ряды). Изменять `minecraft_accounts` разрешено только общим методом. Тест гонки применения и отвязки обязателен (дизайн 4.2.1 и раздел 11).
- M1, `maxmemory = 0`: одно поведение — fail-closed для буфера, как при политике вытеснения и недоступном `CONFIG GET`; проверка при старте, при каждом переподключении к Redis и по таймеру.
- M3, TTL: `TTLsvc = max(300, ceil10(1,4 × (T + 90)))` (300 с при `T = 120 с`, 970 с при `T = 600 с`); приёмник не стартует сборку при `TTLsvc < T + 90`; учёт `svc` ведётся с запасом: 256 байт на служебный ключ, до 8 ключей (2 КБ) на снимок.
- M4, справедливая доля: одна формула `L(N) = min(20 МБ, floor(64 МБ / N))`, число серверов с `inventory-sync` не больше 64 (минимальная доля 1 МБ вместо прежнего `max(1 МБ, F)`, дававшего сумму долей больше потолка при `N > 64`); сумма долей не больше 64 МБ для `N` = 1, 2, 3, 4, 64, 65 и большого `N`.
- Открытые пункты к реализации среза 1 (дизайн 13.1): окно проверки политики Redis при failover (M2), детали админ-сброса (право, свежая 2FA, причина; M6), порядок П3 и П4, флуд аудита, Redis Cluster, расхождение ссылок между ветками.

**Consequences.**

- Реализация заблокирована: миграции (Q28), старт Bridge и ревизия контракта (Q32, Q33), приватность и права (Q34), лицензия и сборка ассетов (Q40), юридическая оценка 152-ФЗ (Q39).
- Расхождение документов: Bridge называет инвентарь этапом 10, дорожная карта — этапом 04; поправить при ревизии контракта.
- Остаточный риск: скомпрометированный ключ сервера может подменить инвентарь любого привязанного игрока (проверка присутствия невозможна без `player.join`, выключенного по умолчанию).
- Расхождение с ТЗ доната: там скрытие инвентаря — привилегия Poseidon+, в базовой модели оно доступно всем; решает владелец.

## ADR-0169 — 2FA персонала обязательна всегда (флаг requireAdmin2fa снят)

**Status:** Accepted (решение владельца Q22 и Q24, 2026-11-17). Уточняет ADR-0109 и ADR-0156 (пункты про `requireAdmin2fa`, его кэш и поведение без ключа). Реализация: коммиты a1b1e30 (API, shared), 8507dbe (web), fe368f0 (e2e); в `main` не смержено.

**Context.** По ADR-0109 требование 2FA для персонала включалось флагом `SiteSettings.requireAdmin2fa` (по умолчанию выключен) и кэшировалось на 15 с; ADR-0156 добавил fail-closed без ключа, но только при включённом флаге. Владелец решил (Q22): 2FA персонала обязательна всегда, переключателя нет. По Q24 (вариант а): зафиксировать охват в ADR, повторное подтверждение 2FA для чувствительных операций (step-up) сделать позже отдельной задачей.

**Decision.**

- Требование действует всегда; таблица настроек для этого решения не читается, кэш и `resetAdmin2faCache` удалены. Единая проверка `isAdmin2faDenied` / `assertAdmin2fa` в `apps/api/src/modules/roles/guards/permissions.guard.ts`.
- Нет ключа `TWO_FACTOR_ENCRYPTION_KEY` (после `trim` короче 32 символов) и окружение production-like (пустой или не заданный `NODE_ENV` = production, ADR-0164): отказ всем действиям персонала (fail-closed).
- Нет ключа и явный `NODE_ENV=development` или `test`: требование не применяется, при старте один раз пишется предупреждение. Допущение: исключение сохранено из ADR-0156 для dev/test, где ключ не задан; требует подтверждения владельца.
- Ключ есть: пользователь без включённой 2FA получает 403 с `code: 'admin_2fa_required'`.
- Охват:
  - любое действие, защищённое `@RequirePermissions`, через `PermissionsGuard`;
  - staff-эндпоинты без `@RequirePermissions`, где проверка вызывается явно через `assertAdmin2fa`: в `communications.controller.ts` это `GET /communications/recipients` (достаточно любого из прав `communications.messages.send` или `communications.messages.bulk`); остальные методы контроллера идут через `@RequirePermissions`;
  - WS-gateway чата (`chat.gateway.ts`): `pin_message`, `mute_user`, `ban_user`, `delete_message` в модераторской ветке (не автор, ADR-0156) и `send_message` в read-only канал по праву `chat.messages.post_readonly` (`chat.service.ts:195`, колбэк `beforeStaffAction`); флаг читается из БД на действии, ошибка `admin_2fa_required: ...` уходит событием `error`;
  - явные вызовы `assertAdmin2fa`/`isAdmin2faDenied` в местах, где доступ даётся правом персонала вне guard: `communications.controller.ts:57` (`GET /communications/recipients`); `reports.controller.ts:61` и `reports.service.ts:286` (`GET /reports/:reportNumber`: чужое обращение по `reports.view` без 2FA даёт 403 `admin_2fa_required`, автор без 2FA читает своё как игрок); `files.service.ts:111` (загрузка типов с `preset.permission`, обычная загрузка без права не затронута; `user` передаётся из `files.controller.ts`).
- Чтение staff-видимого контента (закрыто, R35): `events.service.ts` (`events.view.staff`: `canView`, `list`), `forms.service.ts` (`forms.view.helper|moderator|admin|owner`: `canView`), `topics.service.ts` (`topics.view.*`: `canView`). Семантика: чтение -> видимость игрока, действие -> 403. Если видимость расширяется правом персонала и `isAdmin2faDenied(viewer, config)` истинно, сотрудник считается обычным игроком: публичные страницы работают, скрытые, черновые и staff-видимые элементы не отдаются, без 403; право при этом даже не запрашивается. Сервисы принимают viewer как `{ id, twoFactorEnabled }` (из `JwtStrategy`) вместо одного `id` и получают `ConfigService`. Запись на staff-событие (`EventsService.attend` через `canView`) без 2FA даёт 404 как игроку; отдельного действия по праву персонала (создание/правка/удаление) в этих трёх публичных сервисах нет, админские контроллеры закрыты `PermissionsGuard`. `GET /events/mine` фильтра видимости не применяет сознательно: отдаются только собственные события пользователя (созданные им или с его участием, включая STAFF-события), чужого не раскрывает, поэтому 2FA там не проверяется.
- Вне охвата (осознанно, по инвентаризации проверок прав вне `PermissionsGuard`):
  - Обход техработ и выключенных модулей (`system.maintenance.bypass`): `site-module.guard.ts:69`, `chat.gateway.ts:96`, `direct-messages.gateway.ts:95`. Даёт только доступ к сайту во время техработ, не действие администрации; отказ сотруднику без 2FA только мешал бы ему дойти до настройки 2FA.
  - Проверки внутри эндпоинтов, уже закрытых `PermissionsGuard` (2FA проверена guard-ом): `reports-moderation.service.ts:406` (`reports.delete` для чужой заметки, эндпоинт `reports.notes`), `storage-retention.service.ts:253`, `system.service.ts:66`, `users.controller.ts:142`, `roles.controller.ts`, `role-bulk.service.ts:68`, `user-roles.controller.ts:70` и `:131`.
  - Иерархия `canActOn` внутри guard-защищённых вызовов: `admin-users-bulk.service.ts:33`, `moderation.service.ts:32`, `users.controller.ts:152`.
  - `reports-moderation.service.ts:180`: проверяется право назначаемого исполнителя, а не актёра (актёр под guard `reports.assign`).
  - `auth.controller.ts:291`: свои effective permissions для UX меню, привилегированных данных не даёт.
- Step-up (повторное подтверждение 2FA перед чувствительными операциями) НЕ делается (Q24 а); отдельная задача позже.
- Колонка `SiteSettings.requireAdmin2fa` остаётся в `schema.prisma` с пометкой `/// Deprecated`; DROP только по отдельному решению владельца как contract-миграция по ADR-0158 (раздельные expand и contract).
- Вход, `/auth/2fa/*` и настройка 2FA не требуют прав и проверку не проходят: пользователь без 2FA может войти и включить её сам. Следствие: сотрудник без 2FA сам настраивает 2FA через `/auth/2fa/*`; это же смягчает lockout R31 (после выкладки достаточно включить 2FA самому, до этого момента действия по праву отклоняются).

**Consequences.**

- Lockout: при заданном ключе у каждого сотрудника, у кого 2FA ещё не включена, любые действия по праву дают 403 `admin_2fa_required` до включения. Для владельца при потере устройства и резервных кодов остаётся только сброс в БД вручную: офлайн-процедура `docs/runbooks/owner-emergency-access.md` (зависимость от неё принята; SQL выполняет только владелец, агентам запрещено).
- Смена `TWO_FACTOR_ENCRYPTION_KEY` делает все включённые 2FA нерабочими (ADR-0109); менять только вместе со сбросом 2FA у пользователей.
- Тесты: e2e ставят тестовым сотрудникам `twoFactorEnabled=true` через `apps/api/test/helpers/staff-two-factor.ts` (секрет TOTP не создаётся; test-only, на production не влияет и реальный вход со 2FA не покрывает). e2e не запускались (запрет владельца).
- Комментарий в шапке `two-factor.service.ts` обновлён под это решение (по ревью).
- Контракт API: поле `requireAdmin2fa` убрано из DTO обновления настроек сайта (`forbidNonWhitelisted`) и из ответа `GET /admin/settings/site`; старый клиент, присылающий его, получает 400.
- DROP колонки `requireAdmin2fa` не выполнен: до отдельного решения поле остаётся и не читается.

## ADR-0170 — Выдача роли: права роли входят в права выдающего (Q23)

**Status:** Accepted (решение владельца Q23 вариант а, 2026-11-17). Дополняет ADR-0004 (priority-иерархия) и ADR-0169. Ветка fix/q23-role-grant-subset от fix/q22-admin-2fa-always; в `main` не смержено.

**Context.** `POST /admin/users/:userId/roles/:roleId` (`user-roles.controller.ts`) проверял только `isAssignable`, priority роли ниже собственного и `canActOn`. Права самой роли не сравнивались: сотрудник с `roles.assign` мог выдать (себе нельзя из-за canActOn, но другому, в том числе сообщнику) роль с правами, которых у него нет, и затем получить их через цепочку. Решение владельца: проверять, что права выдаваемой роли входят в права выдающего, кроме владельца.

**Decision.**

- Единая точка: `PermissionService.assertGrantorCoversRole(grantorId, role)` (`apps/api/src/modules/roles/permission.service.ts`). Берутся эффективные права выдающего (`getEffectivePermissions`) и ALLOW-права роли из `RolePermission`; если есть ключи роли, которых нет у выдающего, 403 `{ code: 'role_permissions_exceed_grantor', message, missing: [...] }` (формат как у `admin_2fa_required`: `ForbiddenException` с `code`).
- Владелец определяется механизмом проекта: у пользователя есть назначенная роль с `Role.isSuperuser = true` (`getEffectivePermissions().superuser`). Это не приоритет, не `accountType=SYSTEM` и не отдельный флаг пользователя. Владелец проверку подмножества не проходит. `accountType=SYSTEM` как цель по-прежнему защищена (существующая проверка сохранена).
- Роль с `isSuperuser = true` имеет пустой список прав (доступ даёт флаг), поэтому не-владелец не может выдать её никогда (`missing: ['*']`).
- Wildcard: константа `WILDCARD = '*'` в коде есть, но ни один механизм её не использует (superuser решается флагом роли). Если у выдающего есть право `*`, оно покрывает любые права роли; право `*` в выдаваемой роли требует `*` у выдающего. Поведение закладывается на будущее и тестируется.
- Порядок проверок в `assign` сохранён: роль и цель найдены, `isAssignable`, для не-владельца priority роли < своего, `canActOn`, затем новая проверка подмножества; для владельца остаётся запрет на SYSTEM-цель. Снятие роли (`DELETE`) не менялось.
- Пути выдачи роли: единственный в рантайме API, `user-roles.controller.ts` `assign` (upsert `userRole`). Прочие пути выдачи в `apps/api/src` не найдены (регистрация, OAuth, приглашения, nested writes `roles: { create|connect }` отсутствуют). `prisma/seed/bootstrap.ts:208` выдаёт роль системным аккаунтам при запуске seed владельцем и в рантайме API не вызывается; проверка там не добавлялась.
- Проверка в момент выдачи; последующее изменение набора прав роли отдельно контролируется в `roles.controller.ts` и `role-bulk.service.ts` (уже требуют, чтобы добавляемые права были у редактора).

**Consequences.**

- Администратор с узким набором прав больше не выдаёт роли с более широким набором. Роли, уже выданные ранее, не пересматриваются (data risk: миграции данных нет).
- Исправления по ревью (L4): сверка прав в `roles.controller.ts` (строка ~185, `actorEffective.permissions.includes(key)`) и `role-bulk.service.ts` (строка ~90, `actor.permissions.includes(key)`) идёт через `includes(key)` без учёта `*`, а `assertGrantorCoversRole` `*` учитывает. Это строже и безопасно: `*` сейчас никому не выдаётся. Выравнивание отложено до появления `*`.
- Исправления по ревью (L5): в `assign` проверка (`assertGrantorCoversRole`) и `userRole.upsert` выполняются не в одной транзакции (транзакция охватывает только upsert и запись в `roleAssignmentLog`). Возможно узкое окно: права роли расширили между проверкой и записью. Принятый остаточный риск; код не менялся.
- Исправления по ревью (L6): DENY-эффекты не учитываются ни в `getEffectivePermissions` (берутся только ALLOW, см. комментарий со ссылкой на ADR-0004), ни в новой проверке (`rolePermission.findMany` с `effect: 'ALLOW'`). Это согласовано с текущей моделью.
- Клиент (web) получает 403 с `code` и `missing`; текст `message` перечисляет недостающие права. UI-обработка кода не менялась.
- Чтение прав роли добавляет один запрос `rolePermission.findMany` на выдачу (низкая частота).
- Тесты: unit `permission.service.spec.ts`, `user-roles.controller.spec.ts`; e2e-кейс в `apps/api/test/roles.e2e-spec.ts` написан статически, не запускался.

## ADR-0171 — Снятие мута и бана в чате: выдавший или равный/старший по приоритету (Q25)

**Status:** Accepted (решение владельца Q25 вариант а, 2026-11-17: «снимать мут и бан может только выдавший или равный/старший по приоритету»). Дополняет ADR-0164 (иерархия при выдаче, Q11, `canActOn`) и ADR-0004. Ветка fix/q25-chat-unmute-hierarchy от 153c5b4; в `main` не смержено.

**Context.** `ModerationService.unmute(id)` и `unban(id)` (`DELETE /admin/chat/mutes/:id`, `DELETE /admin/chat/bans/:id`) проверяли только право `chat.mutes.delete` / `chat.bans.delete`. Модератор мог снять мут или бан, выданный администратором или владельцем. Поля `ChatMute.mutedBy` и `ChatBan.bannedBy` (строка, без relation) уже есть, миграции не нужны.

**Decision.**

- `unmute(actorId, id)` и `unban(actorId, id)` принимают actor из контроллера (`@CurrentUser`), HTTP-контракт не менялся. Порядок: запись не найдена, 404; затем проверка иерархии; затем снятие. Проверка права (`PermissionsGuard`) остаётся первой и не заменяется.
- Правило: снять можно, если `actorId == mutedBy/bannedBy` либо приоритет снимающего >= приоритета выдавшего. Единая точка: `PermissionService.canRevokeSanction(actorId, issuerId)` (`getMaxPriority`; у superuser приоритет бесконечный). Равный приоритет разрешён, в отличие от `canActOn` (там строго больше): ограничение Q25 сформулировано как «равный или старший».
- `canActOn(actor, target)` при снятии не применяется. Обоснование: снятие санкции не действие против цели, а откат чужого решения; смысл иерархии в защите решения выдавшего, а не цели. Если бы требовалось `canActOn`, модератор не мог бы снять собственный мут с коллеги, который позже получил равную роль, а удалённая цель (SYSTEM) блокировала бы очистку. Выдавший всегда может снять свою санкцию, даже если его приоритет позже понизили.
- Самоснятие: если снимающий и цель совпадают (человек снимает мут/бан с самого себя) и он не является выдавшим, отказ. Иначе участник с правом `chat.*.delete`, получивший санкцию от старшего, снял бы её сам. Выдавший себя (абсурдный случай) разрешён общим правилом.
- Выдавший «неизвестен», если `mutedBy`/`bannedBy` пуст, пользователь с таким id не найден (удалён) или его `accountType = SYSTEM` (системные и автоматические санкции). **Допущение:** тогда снять может только тот, чей приоритет >= максимального приоритета среди всех ролей (`role.aggregate _max priority`), то есть фактически владелец; если ролей нет, только superuser. Обоснование: неизвестный выдавший мог быть любого ранга, консервативно предполагается старший; ложный отказ исправляется владельцем, ложное разрешение нет. Владелец может заменить правило (например, любой старший администратор), см. вопрос в отчёте.
- 403 с общим текстом «Недостаточно прав для снятия этого ограничения», без раскрытия ролей и приоритетов.
- Мут, истёкший по `mutedUntil`, но с `isActive=true`, обрабатывается так же (запись снимается по тем же правилам).
- Владелец (superuser) не может снять с себя санкцию, выданную другим: правило самоснятия применяется ко всем, без исключения для superuser (консервативно; `assertCanRevoke`: `actorId !== targetUserId` обязательно, если снимающий не выдавший).
- Приоритеты сравниваются на момент снятия, а не выдачи: `canRevokeSanction` берёт текущие `getMaxPriority` снимающего и выдавшего. Если выдавшего позже понизили, его санкцию может снять и более младший, чем он был при выдаче; если повысили, снять сложнее. Исключение только «выдавший == снимающий» (всегда разрешено).
- Кеш эффективных прав (ревью Q25, L9): `maxPriority = -Infinity` («нет ролей») при JSON-сериализации давал `null`, а `null >= 0` равно true. Чтение из кеша теперь восстанавливает `-Infinity` (`getEffectivePermissions`), риск R39.

**Consequences.**

- Модератор больше не снимает санкции администратора; администратор снимает санкции модератора. Поведение «модератор снимает свой мут» (e2e `chat.e2e-spec.ts`) сохранено.
- Другие пути снятия не менялись (см. отчёт и R38): массовый разбан `admin-users-bulk.service.ts`, account-level разбан `quick-moderation.service.ts`, `ReportBan` в `reports-admin.service.ts`. WS-пути снятия мута/бана в чате нет (в `chat.gateway.ts` только `mute_user`/`ban_user`).
- Существующие записи с `mutedBy`, не найденным в `users`, снимает только владелец.
- Данные и миграции: не менялись.
- Тесты: unit `moderation.service.spec.ts`, `permission.service.spec.ts`; e2e не запускались, существующий кейс (модератор снимает свой мут и бан) не требует правки.

## ADR-0172 — Тип уведомления REPORT_STATUS_CHANGED и права заметок обращений reports.notes.edit / reports.notes.unpin (Q26, Q27)

**Status:** Accepted (решения владельца Q26 и Q27, 2026-11-17). Дополняет ADR-0119 (заметки модератора) и срез 2 обращений. Ветка feature/q26-q27-report-status-notification от 2157bbe; в `main` не смержено. Миграция на production применяется только владельцем (Q28, Q43).

**Context.** Смена статуса обращения слала уведомление `REPORT_VERDICT`, хотя вердикт и смена статуса разные события. Правка чужих заметок проверялась правом `reports.delete`, открепление заметки правом `reports.notes.pin`; отдельных прав в каталоге не было.

**Decision.**

- Q26: новое значение enum `NotificationType.REPORT_STATUS_CHANGED`. `changeStatus` шлёт новый тип; `setVerdict` остаётся на `REPORT_VERDICT`.
- Q27: новые права `reports.notes.edit` (правка чужих заметок; автор всегда правит свои) и `reports.notes.unpin` (открепление). Закрепление остаётся за `reports.notes.pin`. Уточнение по ревью: `PATCH .../notes/:noteId/pin` только закрепляет (`pinned:false` -> 400), открепление — только `DELETE .../notes/:noteId/pin` под `reports.notes.unpin`, иначе держатель pin обходил бы право unpin. `reports.delete` и `reports.notes.pin` для правки и открепления больше не используются.
- Миграция `20261017000000_report_status_changed`: одна команда `ALTER TYPE "NotificationType" ADD VALUE 'REPORT_STATUS_CHANGED';`.

**PostgreSQL и ADD VALUE.** В PostgreSQL 12+ `ALTER TYPE ... ADD VALUE` допустим внутри транзакции, но добавленное значение нельзя использовать (в DML, значениях по умолчанию, индексах) в той же транзакции до её коммита. Миграция только добавляет значение и нигде его не использует. Prisma выполняет `migration.sql` одним скриптом; образец с тем же шаблоном: `20261004144405_add_activity_notification_types` (несколько `ADD VALUE` подряд). Здесь значение одно, оговорка про PostgreSQL 11 и ниже не применима. Код приложения использует значение только после применения миграции и деплоя.

**Expand/contract.** Изменение чисто аддитивное (expand): новое значение enum и новые строки каталога прав. Откат кода безопасен: старый код не знает нового значения и не читает его при отсутствии записей; уже созданные уведомления `REPORT_STATUS_CHANGED` старый код получит в выборке, поэтому откат кода после появления таких строк нужно проверить на клиентах (риск R40). Удалить значение enum нельзя без деструктивной операции (пересоздание типа или удаление уведомлений); для этого нужно отдельное решение владельца (contract-фаза не планируется).

**Шаблон добавления прав.** Права описываются в каталоге `PERMISSIONS` в `packages/shared/src/permissions.ts`. Seed только синхронизирует таблицу `permissions` с каталогом; ролям права выдаются через админку, seed-ролей с наборами прав нет. Поэтому добавление права в каталог само по себе никому его не выдаёт.

**Consequences.**

- Fail-closed: пока владелец не выдал `reports.notes.edit` и `reports.notes.unpin` ролям, персонал теряет правку чужих заметок (раньше через `reports.delete`) и открепление (раньше через `reports.notes.pin`). Свои заметки автор правит по-прежнему; закрепление и создание не затронуты.
- Порядок выпуска: применить миграцию, запустить seed синхронизации каталога прав, выдать права ролям в админке, затем деплой кода (либо деплой и сразу выдача).
- Web: кнопки правки чужой заметки и открепления зависят от новых прав (коммит web); без прав скрыты.
- Тесты: unit api, web; e2e `reports-support.e2e-spec.ts` обновлён статически, не запускался.

**Open question to owner.** Выдать новые права ролям вручную через админку или сделать отдельную миграцию данных (выдать `reports.notes.edit` ролям с `reports.delete`, `reports.notes.unpin` ролям с `reports.notes.pin`)? Миграция данных потребует ревью по Q28; без решения права выдаются вручную.

## ADR-0173 — Единое правило снятия санкции для всех путей; поле «кто выдал» у бана аккаунта (Q48, Q49)

**Status:** Accepted (решения владельца Q48 и Q49, 2026-11-17). Уточняет ADR-0171 (правило Q25 для мутов и банов чата) и закрывает R38. Ветка fix/q48-unban-hierarchy-all от f03a0d2; в `main` не смержено. Миграция на production применяется только владельцем (Q28, Q43).

**Context.** ADR-0171 ввёл правило снятия только для чата. Бан аккаунта (`User.isBanned`), бан в обращениях (`ReportBan`) и массовое снятие снимались любым держателем права. Допущение ADR-0171 «неизвестный выдавший -> приоритет не ниже максимального» не давало владельцу снять с себя чужую санкцию.

**Decision.** Единое правило в `PermissionService.evaluateSanctionRevoke` / `assertCanRevokeSanction` / `canRevokeSanction(actorId, issuerId, targetUserId?)`. Порядок проверок:

1. Действующий — владелец (`Role.isSuperuser`, как в ADR-0170): разрешено всегда, в том числе с себя (Q49).
2. Выдавший неизвестен (нет записи, пользователь удалён, `accountType=SYSTEM`): только владелец.
3. Цель — сам действующий, а выдал не он: запрещено (Q49, для всех, кроме владельца).
4. Действующий — сам выдавший: разрешено.
5. Иначе разрешено при приоритете действующего не ниже приоритета выдавшего.

Отказ — 403 с кодом `sanction_revoke_forbidden` (текст общий, роли не раскрываются). Права на действие и иерархия к цели (`canActOn`) там, где были, сохранены; в массовом снятии для владельца на самого себя `canActOn` не применяется (иначе Q49 не выполнялся бы).

**Пути.**

- Чат (мут, бан): правило через `assertCanRevokeSanction`; изменение против ADR-0171 — неизвестный выдавший теперь «только владелец» (раньше порог «максимум приоритета»), владелец снимает с себя чужую санкцию.
- Бан аккаунта: колонка `users.bannedById`. `QuickModerationService.ban` записывает выдавшего, `unban(targetId, actorId)` проверяет правило и очищает поле.
- Массовое снятие (`PATCH /admin/users/bulk`, `UNBAN`): правило для каждого пользователя; отказ по одному не валит пакет, он попадает в `failed` с `reason` и новым необязательным `code`.
- Бан в обращениях (`DELETE /admin/reports/ban/:userId`): правило для КАЖДОГО активного `ReportBan` (у них разные выдавшие, `bannedBy`). Выбрана семантика «всё или ничего»: если хоть один бан снимать нельзя, ответ 403 и ничего не снимается. Частичное снятие оставило бы пользователя в промежуточном состоянии, а младший смог бы снять часть банов старшего, выбирая их порядком вызова.

**Старые баны без выдавшего.** У уже выданных банов аккаунта `bannedById` = NULL. По решению владельца это равно «выдал системный владелец»: снять может только владелец. Данные не перезаполняются (миграция только добавляет колонку). Тот же результат для бана, где выдавший позже удалён или это SYSTEM.

**FK-решение.** Колонка `TEXT NULL` без внешнего ключа и без индекса. Причины: у `ChatBan.bannedBy`, `ReportBan.bannedBy`, `UserPunishment.issuedBy` FK тоже нет (единообразие); FK `ON DELETE SET NULL` потребовал бы self-relation и обратного поля в модели `User` (сверх «одной колонки»); удалённый выдавший и так обрабатывается кодом как «неизвестный» (пользователь не найден -> только владелец), то есть поведение при SET NULL и при «висячем» id одинаково. По колонке нет запросов, индекс не нужен. Цена: возможен «висячий» id, но он безопасен.

**Автоснятие по `bannedUntil`.** В коде автоматического снятия нет: `isBanned` проверяется в `JwtStrategy` и при входе без учёта `bannedUntil`, ни планировщик, ни вход не сбрасывают флаг (поведение не менялось и не затронуто). Если автоснятие появится, это не действие актора, правило к нему не применяется, но оно должно очищать `bannedById` вместе с `isBanned`.

**Аудит.** Каждое снятие пишет запись через `AuditService.log` после успешного изменения: `chat.mute.revoke`, `chat.ban.revoke`, `user.unban`, `reports.ban.revoke` (на каждый бан). `changes`: `issuerId` (или «нет записи»), `ownerOverride` (владелец снял санкцию, выданную не им или без известного выдавшего), `self` (цель — сам действующий), плюс `userId` там, где он не равен `targetId`. Дубли: `AuditInterceptor` пишет запись с ключом права на каждый DELETE с `@RequirePermissions`, поэтому на трёх хендлерах (чат: unmute, unban; обращения: unbanUser) добавлен `@SkipAudit()`, bulk уже был с `@SkipAudit()`. Запись при отказе (403) не пишется.

**Consequences.**

- Fail-closed для старых банов: до применения миграции и после неё снять бан аккаунта, выданный до этого, может только владелец.
- Порядок выпуска: миграция `20261117000000_user_banned_by` -> деплой кода. Код до миграции роняет чтение любого пользователя (Prisma Client включает `bannedById` в каждый запрос к `users` без `select`; отказывают вход и `jwt.strategy.ts`), миграция идёт первой.
- Откат кода безопасен: колонка nullable, старый код её не читает.
- Известное ограничение: забаненный аккаунт не проходит `JwtStrategy`, поэтому самоснятие бана аккаунта через API практически недостижимо (правило всё равно соблюдено); Q49 реально действует на мут/бан чата и бан в обращениях.
- Тесты: unit `permission.service.spec.ts`, `moderation.service.spec.ts` (чат), `quick-moderation.service.spec.ts`, `admin-users-bulk.service.spec.ts`, `reports-admin.unban.spec.ts`; e2e `unban-hierarchy.e2e-spec.ts` написан статически, не запускался.

**Допущения chief (раунд ревью 1; по смыслу ответа Q48 «снять бан или мут может только выдавший либо равный/старший по приоритету, владелец всегда»; владелец их не подтверждал).**

1. Замена действующего бана в обращениях = его снятие. `banUser` перед деактивацией проверяет `assertCanRevokeSanction(actor, ban.bannedBy, userId)` для каждого заменяемого бана («всё или ничего», 403 `sanction_revoke_forbidden`); младший не перебивает бан старшего. Кроме того, при выдаче бана (в обращениях и бана аккаунта через `QuickModerationService.ban`) проверяется иерархия к цели `canActOn`: бан старшего или равного даёт 403. Замена, деактивация и аудит снятий выполняются одной транзакцией. Это закрывает R41.
2. Приоритет выдавшего берётся на момент снятия, а не выдачи: если у выдавшего потом изменились роли, сравнивается текущий приоритет. Выдавший без ролей получает `-Infinity`, поэтому его санкцию может снять любой действующий с правом (приоритет любого действующего, даже без ролей, не ниже `-Infinity`; доступ к самому действию определяется правом `@RequirePermissions`). Выдавший, которого нет (удалён) или SYSTEM, считается неизвестным: только владелец.
3. Аудит снятия не должен тихо теряться. `AuditService.log` глотает ошибку при severity ниже critical, поэтому для снятия бана аккаунта и бана в обращениях запись пишется новым методом `AuditService.logInTx(tx, ...)` в той же транзакции, что и снятие: ошибка записи откатывает снятие (аудит и действие атомарны). Альтернатива «severity critical» отвергнута: снятие уже было бы зафиксировано без записи. Поведение `log()` для других модулей не менялось. Чат (`ModerationService.auditRevoke`) в этом раунде не менялся (вне scope).
4. Гонки: снятие и выдача бана аккаунта выполняются условным `updateMany` (снятие: `isBanned = true` и `bannedById`, на котором принято решение; выдача: `isBanned = false`); при `count = 0` — 409 Conflict, а не автоповтор: проверка прав относилась к другому выдавшему, повтор должен быть осознанным решением клиента. В снятии бана в обращениях `updateMany` условен по id проверенных банов с `isActive`, при несовпадении числа — 409.
5. `issuerKnown` в решении отражает фактическую известность выдавшего (запись есть, пользователь существует, не SYSTEM), в том числе для владельца; на доступ не влияет.

## ADR-0174 — Миграция данных: выдача прав reports.notes.edit и reports.notes.unpin ролям со старыми правами (Q50)

**Status:** Accepted (решение владельца Q50, вариант (б), 2026-11-17). Продолжает ADR-0172 и закрывает ручную выдачу прав из R40. Ветка fix/q50-notes-perms-backfill от 52d5335; в `main` не смержено. Миграция применяется на одноразовой БД (Q28), на production её применяет владелец (Q43).

**Context.** ADR-0172 разделил права заметок: правка чужих заметок раньше шла по `reports.delete`, открепление по `reports.notes.pin`. Новые ключи роли сами не получают, и после деплоя персонал потерял бы эти действия до ручной выдачи.

**Decision.** Миграция `20261117010000_reports_notes_permissions_backfill` (SQL написан вручную):

1. Создаёт права `reports.notes.edit` и `reports.notes.unpin` в `permissions` (module `reports`, description как в `packages/shared/src/permissions.ts`), если их нет.
2. Выдаёт `reports.notes.edit` каждой роли, у которой есть `reports.delete` с effect ALLOW; `reports.notes.unpin` каждой роли с `reports.notes.pin` ALLOW. DENY не копируется.
3. Идемпотентна: `ON CONFLICT DO NOTHING` у всех трёх вставок (первичный ключ `role_permissions(roleId, permissionId)`, уникальный `permissions.key`).
4. Только `INSERT`: без `DROP`, `DELETE`, `UPDATE`, `TRUNCATE`, `ALTER`. Старые права и выдачи не трогаются.

**id прав.** `Permission.id` в схеме `@default(cuid())` генерирует клиент Prisma, в SQL его нет. Выбран детерминированный id `migrated-<key>` по образцу миграции `20261009150000_site_alert_social_links` (`'migrated-' || platform`): повторяемо, без расширений БД. Конфликт и по `key`, и по `id` гасит `ON CONFLICT DO NOTHING` без указания цели.

**Совместимость с seed.** `prisma/seed/index.ts` синхронизирует каталог через `permission.upsert({ where: { key } })`: после миграции находит запись по `key`, обновляет `module` и `description`, `id` не меняет, дублей нет; если seed был раньше, миграция получает конфликт по `key` и ничего не делает. Выдачи ролям seed не затрагивает (в нём нет `rolePermission`), поэтому он их не стирает. Риск: код, ищущий право по `id`, а не по `key`, увидел бы `migrated-...` вместо cuid; в репозитории такого нет (проверено статически).

**Если права уже выданы вручную.** Строка `role_permissions` уже есть, конфликт по первичному ключу, миграция её не меняет (включая явный DENY). Проверка выдачи — запросы SELECT в `docs/runbooks/production-env-checklist.md`.

**Порядок выкладки (владелец).** Миграция -> seed -> проверка выдачи (её делает миграция) -> деплой.

**Последствия.** Роль с `reports.delete` (удаление обращения) получает ещё и правку чужих заметок, как было до ADR-0172, то есть эффективные возможности ролей не расширяются относительно прежнего поведения. Роли, получившие `reports.notes.pin` в промежутке, но без старого права, настраиваются вручную. Проверка миграции — unit-тест чтением SQL (без БД); поведение на данных — ручная проверка на одноразовой БД после применения.

## ADR-0175 — Уведомления автору обращения: модератор скрыт, отправитель — система (Q51)

**Status:** Accepted (решение владельца Q51, вариант (а), 2026-11-17: «скрыть модератора в уведомлении автору обращения (отправитель — система). Единый контракт приватности среза 1»).

**Context.** `ReportsModerationService.notifyAuthor` передавал `fromUserId: actorId`. Поле сохранялось в `Notification`, отдавалось в списке уведомлений как `fromUser` (id, username, avatar) и использовалось в push-превью как имя отправителя. Так автор узнавал, какой сотрудник сменил статус, вынес вердикт или ответил, вопреки приватности из ADR-0119 (игрок не видит сотрудников в самом обращении).

**Decision.**

1. `notifyAuthor` (единственная точка уведомлений автору по действиям персонала: `REPORT_STATUS_CHANGED`, `REPORT_VERDICT`, ответ модерации `SYSTEM`) больше не передаёт `fromUserId` и иных данных сотрудника. Payload: `userId`, `type`, `title`, `message` (только метка статуса), `link`, `metadata.reportNumber`. Образец системного уведомления — вызовы `notifications.create` без `fromUserId` (объявления, `announcements.service.ts`).
2. Без `fromUserId` в общем сервисе уведомлений `fromUser` = null, push-превью не подставляет имя, WS и email несут только текст выше. Для новых записей этого достаточно.
3. Уведомление исполнителю при назначении (`REPORT_ASSIGNED`, адресат — персонал) не менялось: `fromUserId` сохраняется.
4. Проверка «себе не шлём» (автор == исполнитель) сохранена.
5. Старые записи (R44) скрываются при чтении, на уровне API, без миграции и UPDATE данных. Правило `isReportAuthorNotification` (`apps/api/src/modules/notifications/report-author-privacy.ts`): `type` ∈ {`REPORT_STATUS_CHANGED`, `REPORT_VERDICT`, `SYSTEM`} И `link` начинается с `/support/` (карточка обращения автора). Для таких уведомлений `maskReportAuthorSender` отдаёт `fromUserId: null` и `fromUser: null`. Применяется в `NotificationsService.list`, `markRead`, `markUnread` (ответы с одним уведомлением) и в `create` перед WS-доставкой и push-превью (страховка, если вызывающий передал `fromUserId`). `REPORT_ASSIGNED` и ссылки `/admin/reports/…` (персонал) не затрагиваются. Данные в БД не меняются, поэтому `fromUserId` остаётся доступным для расследования на стороне сервера.
6. Тесты: `report-author-privacy.spec.ts` (правило, граничные случаи: чужой тип, `/admin/reports/`, `null`-ссылка), `notifications.service.spec.ts` (list, markRead/markUnread, WS), `reports-moderation.service.spec.ts` (в том числе «автору, совершившему действие, себе не шлём»).
7. Web: компонент уведомления при пустом `fromUser` не рисует отправителя; блок «twomc.su · Системное» уже показывается для типа `SYSTEM`. Подпись «Система» для `REPORT_STATUS_CHANGED` и `REPORT_VERDICT` без отправителя реализуется в web-коммите той же ветки.

**Вне решения.** Уже созданные уведомления хранят `fromUserId` (см. R44); внутри самого обращения сообщения персонала уже отдаются автору с `authorId: null` (`reports.service.ts:304-306`), отдельных правок не потребовалось.

**Последствия.** Автор не отличает сотрудников по уведомлениям; аудит действий персонала (`AuditLog`) не затронут.

## ADR-0176 — Удаление заметок обращений: чужая только с reports.notes.edit, закреплённая ещё и с reports.notes.unpin (Q52)

**Status:** Accepted (решение владельца Q52, вариант (а), 2026-11-17: «удаление чужой заметки только с правом reports.notes.edit; закреплённую чужую заметку удалять может только тот, у кого есть и это право, и reports.notes.unpin»).

**Context.** `DELETE /moderation/reports/:reportNumber/notes/:noteId` требовал только `reports.notes` и не проверял автора, поэтому любой сотрудник с `reports.notes` мог удалить чужую заметку, в том числе закреплённую, обходя `reports.notes.edit` (правка, ADR-0172) и `reports.notes.unpin` (открепление).

**Decision.**

1. `deleteModeratorNote(reportNumber, noteId, actorId)` получает id исполнителя из контроллера (`@CurrentUser`).
2. Своя заметка (`authorId === actorId`) удаляется как раньше, в том числе закреплённая, без `reports.notes.unpin`: автор может удалить свою закреплённую заметку без права открепления; права дополнительно не проверяются. Ответ владельца (Q52) касается только чужих заметок; сохранение поведения для автора — допущение chief, не прямое решение владельца.
3. Чужая заметка: нужно `reports.notes.edit`, иначе 403 «Удалять можно только свои заметки».
4. Чужая закреплённая: нужны `reports.notes.edit` И `reports.notes.unpin`, иначе 403 «Удалить чужую закреплённую заметку можно только с правом открепления». Только `unpin` без `edit` недостаточно.
5. Проверка в сервисе через `PermissionsService.hasPermission` (как в `updateModeratorNote`); охрана маршрута `reports.notes` сохранена. Новых кодов ошибок и прав нет, миграций нет.
6. Web: кнопки удаления заметки в интерфейсе нет (есть правка, закрепление и открепление), поэтому web не менялся.

**Последствия.** Роли без `reports.notes.edit` больше не удаляют чужие заметки; перенос прав из ADR-0174 выдаёт `edit` ролям со старым `reports.delete`, `unpin` — ролям со старым `reports.notes.pin`. Если появится кнопка удаления в web, показывать её по тем же правилам.

## ADR-0177 — Глобальный throttler по подсети /64 и «Последний IP» в админке (Q21)

**Status:** Accepted (решение владельца Q21, вариант 1а, 2026-11-17: соседи по одной /64 делят лимит). Уточняет ADR-0163: снимает его оговорку «Глобальный `ThrottlerGuard` и per-route `@Throttle` не менялись (tracker по `req.ip`)». ADR-0163 не отменяется и не переписывается.

**Context.** После ADR-0163 счётчик входа (`BruteForceService`) считался по `/64`, но глобальный throttler по-прежнему брал сырой `req.ip`: IPv6-клиент обходил его, меняя адрес внутри своей `/64`. Кроме того, после ADR-0163 раздел «подозрительная активность» показывает ключ подсети (`v6:...`), а не адрес клиента, и админ не видит, кто именно стучался.

**Decision.**

1. Throttler. `IpSubnetThrottlerGuard` (`apps/api/src/common/guards/ip-subnet-throttler.guard.ts`) наследует `ThrottlerGuard` и переопределяет только `getTracker`: ключ = `rateLimitKey(req.ip ?? req.socket.remoteAddress)` (ADR-0163): IPv4 и IPv4-mapped — полный адрес, IPv6 — `v6:<h1>:<h2>:<h3>:<h4>` (`/64`), пусто или `unknown` — `unknown`, непустой мусор — `raw:<hash>`. Подключён как глобальный guard в `app.module.ts` вместо `ThrottlerGuard`; метаданные `@Throttle`/`@SkipThrottle` и их аргументы не менялись, поэтому ключ по подсети действует и на per-route лимиты.
2. Соседи по одной `/64` делят общий лимит throttler (принято владельцем, Q21 1а), как и клиенты за одним NAT в IPv4; ложные срабатывания для соседей по /64 (например, у хостингов) допущены.
3. `ws-rate-limit` ключуется по `userId` (`ws:rate:<namespace>:<group>:<userId>`), не по IP; не менялся.
4. Последний IP. `BruteForceService.registerFailure` при каждой неудаче пишет `bruteforce:lastip:<rateLimitKey>` = `normalizeIp(ip)` (полный нормализованный адрес) с `EX 900`; `reset()` удаляет этот ключ вместе со счётчиком и блокировкой. Допущение: требование «тот же TTL» понято как «не меньше, чем у счётчика и блокировки»: счётчик получает EX 900 один раз с первой неудачи, блокировка продлевается при каждой неудаче >= 10, а `lastip` обновляется при каждой неудаче, поэтому не истекает раньше них. Шаблоны `bruteforce:login:*` и `bruteforce:blocked:*` ключ `lastip` не захватывают.
5. Админка. `AdminToolsService.listSuspiciousActivity` читает `bruteforce:lastip:<ключ>` пачками по 100 через `MGET` и отдаёт `lastIp: string | null` (null, если ключ истёк или отсутствует; сам ключ `lastip` отдельную строку не создаёт). Поле `lastIp` добавлено в `SuspiciousIpDto` (`packages/shared/src/api/admin.ts`). Web (`apps/web/src/app/admin/security/page.tsx`): колонка `ip` переименована в «Ключ подсети», добавлена колонка «Последний IP» (при null: «—» и «истёк», для скринридера «Последний IP истёк»).
6. Персональные данные. IP — персональные данные: хранятся только в Redis с TTL 900 с, в БД не пишутся (миграции Prisma нет), в логи не пишутся (как и до ADR-0163). Видны только по праву `security.suspicious.view` (`GET /admin/security/suspicious`) при обязательной 2FA персонала (ADR-0169).

**Consequences.**

- Одна общая корзина throttler на `/64`; для неопределимого IP (пусто, `unknown`) общий ключ `unknown` (R46, R47), для мусора — отдельный `raw:<hash>`.
- Пункт ADR-0163 «Throttler по-прежнему считает полный адрес» устарел с этого ADR; остальное в ADR-0163 действует.
- Админ видит последний полный адрес вместо только ключа подсети; адрес живёт не дольше 15 минут после последней неудачи (R48).
- Тесты: unit `BruteForceService` и `AdminToolsService` (lastip), `security.test.tsx` (web), e2e `throttler-subnet.e2e-spec.ts`, `trust-proxy.e2e-spec.ts` и `admin.e2e-spec.ts` дописаны. e2e написаны статически и НЕ запускались (R49).
- Для верной работы нужен корректный `TRUST_PROXY`: иначе `req.ip` — адрес прокси, и все клиенты делят один ключ (R47).

**Исправления по ревью (2026-11-17).**

- Персональные данные (L5). Полный IP клиента — персональные данные. Он хранится в Redis 15 минут (EX 900, обновляется при каждой неудаче), доступ — по праву `security.suspicious.view` при обязательной 2FA. Правовое основание обработки и запись в реестре обработки персональных данных (в т.ч. нужен ли новый пункт в политике конфиденциальности) — решение владельца; агент его не принимает и не оформляет.
- Охват /64 (L3, L4). /64 объединяет также адреса NAT64 и 6to4, поэтому клиенты за одним NAT64-шлюзом делят лимит (R50). Успешный вход из подсети сбрасывает счётчик, блокировку и `lastip` для всей /64 (R51). Оба эффекта следуют из решения Q21 1а и приняты вместе с ним; смягчение — отдельное решение владельца.
- Тесты. Герметичный `app.module.spec.ts` (виртуальный мок `multer`, зависимости не менялись), тест пачек `MGET` (100, 101, 250 ключей), e2e изоляции /64 переписан на исчерпанный лимит (не запускался).

## ADR-0178 — Зеркало наказаний и синхронизация: срез 1 этапа 02 (ADR-0166)

**Status:** Accepted для среза 1 (реализация ADR-0166 в части контракта, зеркала и синхронизации; адаптер MySQL и публичные страницы — срезы 2 и 3). ADR-0166 не отменяется.

**Context.** ADR-0166 выбирает чтение БД LiteBans через контракт `PunishmentSource` с зеркалом в PostgreSQL. Срез 1 делает всё, что не требует доступа к БД LiteBans и ресурсов (Q28: ресурсы и доступ — по решению владельца).

**Decision.**

1. Контракт `PunishmentSource` (read-only, без write-методов), нормализация строки, статус (`ACTIVE`/`EXPIRED`/`REMOVED`/`DELETED_AT_SOURCE`, считается сайтом, флаг `active` источника не статус), очистка причины и имён от IP, контактов и цветовых кодов ДО записи в зеркало (Q31), `rowHash` SHA-256 нормализованных полей без статуса.
2. Зеркало: таблицы `minecraft_punishments` (ключ `source, sourceScope, kind, sourceId`) и `punishment_sync_state` (водяной знак по `(source, kind)`). Запись — один `INSERT ... ON CONFLICT DO UPDATE ... WHERE rowHash <> EXCLUDED.rowHash`; неизменённые строки не пишутся, `rev` растёт при каждом изменении; курсор двигается в той же транзакции, что и пачка (`GREATEST`).
3. Синхронизация: слой 0 (первичная загрузка по курсору, события не рассылаются), слой 1 (новые строки, перекрытие 100 id), слой 2 (сверка ACTIVE пачками по 500 через `fetchByIds`), слой 3 (полная сверка по диапазонам id, раз в 60 мин), слой T (истечение по `until` силами сайта с поправкой на часы источника). Исчезнувшие строки помечаются мягко (`DELETED_AT_SOURCE`), не удаляются. Пустой источник при непустом зеркале и откат `maxId` ниже курсора не приводят к массовой пометке: код `SOURCE_EMPTY` / `NEEDS_RECONCILE`, курсор не сбрасывается автоматически.
4. Лидерство: опрашивает один экземпляр API (Redis `SET NX PX` с токеном, продление и освобождение по токену через Lua); ошибка Redis = потеря лидерства (fail closed).
5. Без источника (`PUNISHMENT_SOURCE = null` до среза 2) или при `LITEBANS_ENABLED=false` модуль не имеет побочных эффектов: планировщик не стартует, соединений нет, статус «не настроено». `PunishmentsModule` зарегистрирован в `AppModule` именно потому, что безопасен без env.
6. Env `LITEBANS_*`: все необязательны, секретов по умолчанию нет; в production `LITEBANS_DB_SSL=disabled` отвергается, при `LITEBANS_ENABLED=true` обязателен `LITEBANS_DB_SSL_CA_FILE`. Значения задаёт только владелец.
7. WebSocket-рассылка и HTTP API намеренно не делались: сервис отдаёт `onChange` и `getStatus` для среза 3.

**Consequences.** Миграция `20261117020000_punishments_mirror` только создаёт два ENUM, две таблицы и индексы; написана вручную, на БД не применялась (Q28), нужен обязательный ревью. Адаптер mysql2 потребует новой зависимости (lockfile) — отдельное решение. Автосброс курсора после отката источника не делается: строки с id ниже курсора минус перекрытие подхватит только полная сверка (R53).

**Исправления по повторному ревью (раунд 2).** Интерфейс `PunishmentMirrorStore.markDeletedAtSource` и `reactivate` получили необязательный колбэк `beforeGroup`: токен лидера проверяется перед каждой группой записи (M1). Состояние синхронизации пишется только после проверки токена (M2). Слой T (`expireDue`) выполняется только после первой успешной сверки часов с источником (M3). Очистка текстов дополнена склонениями платформ и маскировкой секретов (N1, N5; R56). Схема и миграция не менялись.

**Откат миграции (L3).** Миграция `20261117020000_punishments_mirror` только создаёт объекты, поэтому откат безопасен, пока таблицы пусты (синхронизация выключена): `DROP TABLE punishment_sync_state; DROP TABLE minecraft_punishments; DROP TYPE` для двух созданных ENUM (в таком порядке: сначала таблицы, затем типы), либо восстановление БД из бэкапа. Если синхронизация уже писала данные, откат стирает зеркало, что допустимо: источник истины остаётся в LiteBans, зеркало пересобирается первичной загрузкой. Откат выполняется только по отдельному решению владельца.

**Порядок включения.** Миграцию нужно применить (после ревью Q28, сначала на одноразовой БД) до включения `LITEBANS_ENABLED`: иначе планировщик получит ошибки обращения к отсутствующим таблицам. Без источника и при `LITEBANS_ENABLED=false` модуль не обращается к БД.

## ADR-0180 — Контракт API наказаний: срез 2 этапа 02 (ADR-0166, ADR-0178)

**Status:** Accepted — утверждён chief по итогам независимого ревью Q&S (APPROVE WITH NOTES) 2026-11-17; N1–N3 внесены. Полный текст контракта: `docs/stage-02/BANS-API-CONTRACT.md`. Контроллеров и сервисов нет; миграция среза 2 (индексы и колонки скрытия выдавшего) вынесена в отдельный файл `20261117040000_punishments_public_indexes` и ждёт обязательного ревью по Q28 до написания контроллеров.

**Итог ревью (2026-11-17).** N1: право `punishments.issuer.hide` вводится только через seed (каталог `permissions.ts` и `prisma/seed/index.ts`); seed в production выполняет владелец, до него скрыть выдавшего может только superuser. N2: скрытие и снятие атомарны (условный `UPDATE` или блокировка строки и запись аудита в одной транзакции; сбой аудита - откат и 500; вариант «аудит первым» убран). N3: выдавший сопоставляется с пользователем сайта только по подтверждённой привязке `MinecraftAccount`; ветка «разрешено без сравнения» только для консоли и SYSTEM; несопоставленный выдавший - скрыть может superuser или приоритет не ниже максимального среди персонала (обоснование в 4.2, п.3). N4: тест-план дополнен (31-38). N5: проверки миграции на одноразовой БД и оценка блокировок (2.6). N7: расхождение с дизайном зафиксировано ниже.

**Обновление 2026-11-17 (проход 2, Q63).** Ответ владельца на Q63 (`docs/agent-prompts/09-OWNER-AWAY-QUEUE.md`, дополнение 6) перекрывает пункт Q31 п.5 «данные выдавшего скрыты по умолчанию» и прежние допущения (выдавший скрыт, область не показывается, в аудит пишутся список и карточка, отдельное `punishments.view`). Исходные формулировки ниже сохранены как история и помечены «было»; действует новая редакция.

**Context.** Срез 1 (ADR-0178) создал зеркало наказаний без HTTP-поверхности. Нужен контракт, по которому пойдут бэкенд, ревью и фронтенд. Входы: Q31 (на `/bans` ник, тип, причина, даты, активность; выдавший скрыт [было; заменено Q63 п.3]; IP и контакты никогда), Q58-2, Q59 (публично только причина из шаблона LiteBans или списка категорий, иначе «Нарушение правил»; полный текст - персоналу и самому игроку; скрытие целиком при маскировке остаётся дополнительной защитой), Q57/О1 и О3 (рекомендации как допущения), ADR-0169.

**Decision.**

1. Эндпоинты (`GET`; единственные записывающие методы - `POST` и `DELETE /admin/punishments/:ref/issuer-hidden`, Q63 п.3; было: только `GET`): `/punishments/public` и `/punishments/public/:ref` (без входа), `/punishments/me` (`JwtAuthGuard`), `/admin/punishments`, `/admin/punishments/status`, `/admin/punishments/:ref` (`users.punishments`, 2FA через `PermissionsGuard`). Контроллеры: `MinecraftPunishmentsPublicController`, `MinecraftPunishmentsMeController`, `MinecraftPunishmentsAdminController` в `PunishmentsModule` (имя `PunishmentsController` занято в reports: наказания сайта).
2. Публичный ответ собирается по белому списку; причина наружу уходит только как ключ закрытого словаря из семи значений (читы, оскорбления, спам, реклама, обход наказания, прочее, «Нарушение правил»): по номеру шаблона LiteBans или по точному совпадению нормализованной фразы, иначе «Нарушение правил»; при `isReasonMasked` - всегда «Нарушение правил». Подстрока и ключевые слова запрещены. Q63 п.1-2: до присылки владельцем соответствия шаблонов и формулировок карта шаблонов и список фраз ПУСТЫ и ВЫКЛЮЧЕНЫ (`punishments.public.reasonMap.enabled`, по умолчанию выключен), публично везде «Нарушение правил»; словарь и механизм реализуются сразу, включение - правка конфигурации без смены контракта (было: встроенный небольшой список очевидных формулировок).
3. Публично: `BAN` и `MUTE`, не скрытые, не `DELETED_AT_SOURCE`, не silent, безусловно `ipBan = false` (IP-баны не публикуются вообще, даже с валидным ником; Q31), ник 1-16 символов формата Minecraft. Q63 п.3: выдавший ВИДЕН по умолчанию (публично и игроку): `executor = { console: true } | { name } | null`, `uuid` никогда; настройка `punishments.public.showExecutor` убрана (было: выдавший отсутствует как ключ, пока не включён `showExecutor`; Q31 п.5). Персонал с правом `punishments.issuer.hide` (новое, куратор и выше, 2FA) принудительно скрывает выдавшего у конкретного наказания: `POST` и `DELETE /admin/punishments/:ref/issuer-hidden`, флаг хранится только на сайте (колонки `issuerHidden*` зеркала, добавочная миграция среза 2), синхронизацией не затирается, аудит «кто, у какого наказания, когда». Q63 п.4: область (глобально или сервер) показывается публично везде вместе с названием сервера: `{ kind: 'global' | 'server' | 'unknown' }`, название из `Server` сайта, иначе очищенное значение `server_scope` (было: область публично не отдаётся). Причина снятия публично не отдаётся. Раздел выключен по умолчанию (`punishments.public.enabled`); включать его можно только после юридической оценки владельцем по 152-ФЗ, срока хранения и процедуры скрытия.
4. «Мои наказания» (`/punishments/me`): только по `MinecraftAccount.uuid`, все виды, полный очищенный текст причины; причина снятия и снявший игроку не отдаются; выдавший виден по умолчанию с учётом флага скрытия, область с названием сервера (Q63 п.3-4; было: выдавший игроку не отдаётся). Офлайн-UUID (версия 3) при отсутствии подтверждённой аутентификации - `linked: false` (fail-closed для любого uuid версии 3 до ответа владельца про `online_mode`). Во фронтенде отдельно от «Наказаний на сайте» (`users/me/punishments`).
5. Пагинация курсорная без `total`; курсор несёт хэш фильтров и `order`, чужой курсор - 400. Статус при чтении пересчитывается (`computePunishmentStatus`). Публичный кэш `max-age=15`, слабый ETag без `generatedAt`; личные и административные ответы `no-store`. Скрытая запись может быть видна клиентам порядка 50 с (5 + 15 + 30); серверный кэш сбрасывается при изменении `isHidden`.
6. Недоступность и порядок проверок: throttle 429, права 401/403, раздел выключен 404 (guard, до валидации), валидация 400, нет привязки `linked: false`, нет первичной загрузки хотя бы одного нужного вида (`initialSyncDoneAt`, в т.ч. нет строки `PunishmentSyncState`) 503 `punishments_unavailable` с `Retry-After`, иначе 200; `meta.stale` по самому старому `lastSuccessAt` нужных видов либо при выключенном источнике.
7. Типы: `packages/shared/src/api/punishments.ts` и локальная копия в `apps/api` (eslint запрещает импорт `@twomc/shared`); расхождение ловит контрактный тест (R80), разбирающий файлы компилятором TypeScript и сверяющий виды и статусы с `punishment.types.ts` и enum Prisma; API-only экспорты запрещены (allowlist: `IsoDateString`). Экспорт в `packages/shared/src/index.ts` - часть среза реализации.
8. Персонал (Q63 п.5-6): в `AuditLog` пишется только просмотр карточки (`punishment.card.view`, `ref` и `subjectUuid`); список не пишется (было: каждый поиск и каждая карточка). Публичный банлист (баны и муты) - без входа и без права; расширенная карточка и список персонала - существующее `users.punishments` с 2FA; `punishments.view` не вводится. Единственное новое право - `punishments.issuer.hide` (добавляется в `packages/shared/src/permissions.ts` при реализации; право назначается ролям куратор и выше в данных ролей, иерархия по `PermissionService.canActOn`, superuser проходит).
9. Индекс и миграция: префиксный поиск ника - `$queryRaw` по `lower("subjectName")` с `LIKE ... ESCAPE` и экранированием (Prisma `insensitive` даёт `ILIKE`, индекс не используется); нужны индекс `lower("subjectName") text_pattern_ops` и частичный индекс под публичный предикат с сортировкой `(startedAt, id)`. Решение chief: ОТДЕЛЬНАЯ миграция среза 2, только `CREATE INDEX` и (Q63 п.3, добавочно) `ALTER TABLE ... ADD COLUMN` четырёх новых колонок `issuerHidden*` (без `DROP` и изменения существующего), SQL вручную по Q43(а), ревью по Q28 (`docs/agent-prompts/08-OWNER-ANSWERS-Q14-Q32.md`); миграция среза 1 `20261117020000_punishments_mirror` не затрагивается. Порядок: миграция и её независимое ревью ДО написания контроллеров; `EXPLAIN` на одноразовой БД обязателен; применение к production - только владелец.
**Раунд исправлений 1 (дополнение к решению, 2026-11-17).** (а) `POST` и `DELETE /admin/punishments/:ref/issuer-hidden` требуют ОБА права: `punishments.issuer.hide` и `users.punishments` (решение chief, fail-closed): ответ отдаёт полную карточку персонала, иначе обход аудита `punishment.card.view`. (б) Аудит `punishment.issuer.hide` и `punishment.issuer.unhide` содержит `ipAddress` и `userAgent` (при `@SkipAudit()` общий перехватчик их не пишет; контроллер передаёт их сервису). (в) Иерархия перепроверяется внутри той же `$transaction` непосредственно перед условным UPDATE; остаточное окно (права читаются вне снимка транзакции) - риск R100. (г) ETag снимается у ответов модуля, которым он не положен (ошибки, `me`, `admin/*`), без изменения глобальной настройки Express.

10. WebSocket (раздел 4.6 дизайна) отложен в срез 3b: публичному списку достаточно опроса с ETag, публичная комната - новая неаутентифицированная поверхность. Контракт аддитивен.

**Consequences.** Для реализации ещё нужны ответы владельца В1-В2 (соответствие шаблонов LiteBans и формулировок; обещаны позже, до этого публично «Нарушение правил») и вопрос про `online_mode` (Q63, офлайн-UUID); В3 закрыт Q63 п.3; допущения позволяют начать без остального. Права персонала `users.punishments` шире по охвату (выдача наказаний сайта), принято владельцем (Q63 п.6; `punishments.view` не вводится). Новое право `punishments.issuer.hide` требует добавления в каталог и, вне superuser-ролей, применения seed к целевой БД (только по команде владельца). Имя выдавшего и название сервера теперь публичны: риски R81, R84, R85; скрытие не отзывает уже разошедшееся (R86); аудит списка не ведётся (R82); флаг скрытия теряется при пересоздании зеркала (R83); «куратор и выше» зависит от данных ролей (R87). Нумерация `ref` раскрывает число непубличных записей без содержимого (низкий риск). Индексная миграция среза 2 обязана пройти ревью до контроллеров. Контракт расходится с дизайном (N7: silent скрыт по О1 и Д1; дизайн `LITEBANS-INTEGRATION-DESIGN.md`, раздел 6, показывал silent по умолчанию; приоритет у контракта). Расхождение копий типов - R80.

## ADR-0181 — Фронтенд публичного банлиста и «Наказаний на серверах»: срез 2 этапа 02 (ADR-0180)

**Status:** Accepted (реализация на ветке feature/stage-02-s2-bans-ui, не смержено).

**Context.** ADR-0180 утвердил контракт API наказаний (публичный список и карточка, `/punishments/me`, персонал). Нужен клиент без входа и блок игрока в настройках.

**Decision.**
1. `/bans` и `/bans/[ref]` - публичные страницы с `robots: noindex, nofollow`. Список: баны и муты, поиск по префиксу ника (по кнопке, не по набору: лимит 60/мин), фильтры типа и статуса, сортировка по дате, курсорная пагинация (`nextCursor`, без `total`).
2. Рендерится только белый список полей: ответ API приводится к явно собранным объектам (`toPublicView`, `toMyView`); IP, uuid, контакты и любые лишние поля до разметки не доходят, даже если придут в ответе. Причина выводится дословно как текст, без очистки, разметки и автоссылок (принципы 2-3 контракта).
3. «Настройки -> Наказания»: два блока, «Наказания на сайте» (прежний) и «Наказания на серверах» (`GET /punishments/me`, полный очищенный текст причины, отметка скрытой части, `linked: false` ведёт к привязке). Обжалование зеркальных наказаний не показывается (`appealable` всегда false).
4. Состояния по контракту: 401, 404 (раздел выключен/запись не найдена), 429 с `Retry-After`, 503, `meta.stale`. Для `Retry-After` клиент API (`ApiError.retryAfterSeconds`) разбирает целые секунды.
5. `executor: null` - нейтральная подпись «Выдавший не указан» (форма ответа не различает причины); область - «Глобально», название сервера или «Неизвестный сервер».
6. Вне среза: карточка персонала и скрытие выдавшего (следующий подсрез, карточка пользователя в admin/users).

**Consequences.** Верстка опирается на форму ответа, а не на запуск API (e2e и сборка не запускались). Ссылка в футере ведёт на раздел, выключенный по умолчанию (R105).

## ADR-0179 — Ядро инвентаря на сайте: срез 2 этапа 04 (ADR-0168)

Номер 0179 зарезервирован за этапом 04, поэтому запись стоит после ADR-0181.

**Status:** Accepted в рамках допущений Q34–Q38; ожидают подтверждения владельцем. Срез 2 не смержен. Дата: 2026-11-17.

**Context.** ADR-0168 описывает инвентарь игрока на сайте. Срез 2 реализует хранилище, чтение своего инвентаря и приватность без приёмника Bridge.

**Decision.**
1. Хранится только последнее состояние на `(userId, serverSlug, grp)`, без истории (Q36 а). Очистка рядов без обновлений 90 суток реализована, но не запланирована.
2. Предмет не больше 600 байт канонического JSON (Q35 а). Лор отбрасывается с конца, если не помещается; иначе `invalid_data`.
3. Имена и лор хранятся как есть; при выдаче экранируются как текст, не HTML (Q38 а).
4. Приватность по умолчанию «приватно». Ender Chest публичен только при публичном основном инвентаре (Q34 а).
5. UUID игрока в БД не хранится. В ответ не попадают `userId`, `epoch`, `rev`, `contentHash`.
6. Раздел fail-closed: без `BRIDGE_ENABLED=true` ответ 503 `inventory_unavailable`.
7. Донат-правила не реализуются: точка расширения возвращает `default` (hard gate).
8. `apps/api` держит локальное зеркало контракта из `packages/shared` (eslint запрещает импорт `@twomc/shared`); тест `inventory-contract.sync.spec.ts` сверяет оба файла (L5).
9. Сборка частей снимка не зависит от транспорта (`InventoryAssemblerService`). Проверки формата, диапазонов, `slotGroup` и границ `epoch`/`rev` выполняются до обращения к Redis. Буфер частей в Redis с TTL. Полнота и захват применения атомарны (Lua, дизайн 4.4). Применяется только полный комплект со сверкой набора `slotGroup`. Повтор части не даёт дубля. Повтор завершающей части после сбоя применения не теряет снимок. Таймаут 120 с отбрасывает неполную сборку. Разное `parts` или иное поле заголовка снимка (состав и смысл см. дизайн, разделы 3.6 и 5.4, риск R101) даёт `snapshot_mismatch` и отметку poison.
10. Свежесть: сначала `epoch`, затем `rev`; `capturedAt` в сравнении не участвует (L1). Ряд 32 КБ (Q35).
11. Лимиты (допущения до Q61/Q62, всё в `inventory-assembly.config.ts`): 6 сборок в минуту на игрока; 2 сборки на игрока и группу; 256 сборок и 8 МБ буфера на сервер; доля сервера `min(20 МБ, 64 МБ / N)`; глобально 64 МБ; не более 64 серверов; TTL служебных меток выводится из T (не меньше T + 90 с).
12. Fail-closed: при `maxmemory-policy` не `noeviction` или невозможности проверить политику приём частей блокируется (`resync_required`). Снять блокировку может только явное подтверждение владельца (`redisPolicyAcknowledged`).
13. `Vary: Authorization, Cookie` на ответах `/inventory/me` (L2).

**Consequences.** Чужой инвентарь, админ-доступ и приёмник Bridge остаются следующими срезами. Миграция `20261117030000_inventory_core` написана вручную, на БД не применена и требует обязательного ревью (Q28). Риски: R70–R79 (срез 2), R93–R99 и R101 (сборщик частей и заголовок).

## ADR-0182 — Этап 03, срез 1: приёмник Bridge — схема и план среза

**Status:** Accepted (chief, 2026-11-17, по ревью Q&S; F1–F3, F5, F6 внесены). Владелец отсутствует (режим промпта 09); решения ниже - консервативные допущения до ответов; реализация модуля в этом ADR не описывается как готовая.

**Context.** `docs/stage-03/BRIDGE-CONTRACT.md` (разделы 2, 5, 7, 7.1) описывает приёмник событий от плагина Minecraft-серверов. Q32 (`docs/agent-prompts/08-OWNER-ANSWERS-Q14-Q32.md`): миграции `bridge_servers` и `bridge_event_log` разрешены по Q28; ключи серверов создаёт владелец (HKDF от мастер-секрета); вход и выход игроков - да, IP - нет; чат - позже. Q42 (число серверов) открыт. Срез 1 нужен как основа для приёмника наказаний этапа 02 без чтения LiteBans напрямую.

**Decision.**
1. **В срезе 1:** (а) миграция `20261117050000_bridge_core`; (б) `BridgeSignatureGuard` с `rawBody` (раздел 2.3); (в) `GET /bridge/v1/handshake`; (г) `POST /bridge/v1/events`: дедупликация через `bridge_event_log`, диспетчер по `type`, `punishment.*` -> реализация `PunishmentSource` этапа 02 (тот же синхронизатор, зеркало и WebSocket); (д) `player.*` выключены по умолчанию, в срезе 1 дают `rejected unsupported_type` (отключено); (е) fail-closed: без `BRIDGE_ENABLED=true` и `BRIDGE_MASTER_SECRET` все пути отвечают `503`; (ж) лимиты раздела 5.4; (з) логи без тел, подписей, нонсов и IP; (и) симулятор `apps/api/scripts/bridge-plugin-sim.ts` только при `NODE_ENV` in {development, test}.
2. **Вне среза 1 (срез 2):** `POST /bridge/v1/punishments/snapshot` (сверка, раздел 6), статус серверов в админке, присутствие `player.*`, оповещения о всплесках, админ-эндпоинт регистрации серверов с 2FA (Q22).
3a. **Журнал: очистка и хеш (F5, F6).** Очистка - внутрипроцессный планировщик по образцу `StorageRetentionScheduler` (раз в сутки, пачками `deleteMany` по `receivedAt`, выключен в `NODE_ENV=test`); порог хранения строго не менее 7 суток (нижняя граница в коде и валидация конфига); метрика возраста самой старой записи (R119). `payloadHash` = SHA-256 hex от канонического JSON поля `data` (ключи в лексикографическом порядке на всех уровнях, без пробелов; весь конверт не хешируется). В журнал пишутся только принятые события, `rejected` не пишутся (R117).
3. **Схема (добавочная).** Enum `BridgeServerStatus` и модели `BridgeServer` (`bridge_servers`), `BridgeEventLog` (`bridge_event_log`) - как в разделе 7.1 контракта, без изменений типов. Индексы: уникальный `slug`; уникальный `(serverSlug, eventId)` для дедупликации; `receivedAt` для очистки. Ограничения длины (`VarChar`) заданы контрактом. В журнале нет `data`, только `payloadHash`. Миграция содержит только `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` новых объектов; внешних ключей нет.
4. **Связь со `Server` сайта.** Внешнего ключа на `servers` нет. Обоснование: `Server` - публичная витрина (адрес, порт, MOTD, `isActive`), её жизненный цикл иной; FK потребовал бы менять существующую таблицу или связывать каскады. `BridgeServer.slug` - строка того же вида, что `serverSlug` в `player_inventories` и зеркале наказаний (этапы 02 и 04); сопоставление с `Server.slug` - соглашение (совпадающий slug), а не ограничение БД. Допущение: несовпадение slug допустимо, публичная часть показывает `displayName`.
5. **Регистрация серверов и ключей.** Сайт секретов не генерирует и не хранит; ключ = HKDF-SHA256(мастер, соль = `BridgeServer.slug`, info по 2.4, поколение). Соль единая (F1): `serverId` в протоколе (`key-id`, конверт, дедупликация) = `slug`; формат `^[a-z0-9][a-z0-9-]{1,31}$`; смена slug запрещена, новый slug = новый сервер (R116, R118). Минимум для среза 1 (F3) - две отдельные операции. (1) CLI регистрации строки `BridgeServer` (поколение 1, `ACTIVE`): мастер-секрет НЕ требуется; `NODE_ENV` пустой или не задан = production, отказ (fail closed, как `isProductionLike` в `apps/api/src/config/node-env.ts`); в production запускает только владелец. (2) Вывод ключа сервера - отдельная команда, её запускает только владелец, агент не запускает; ключ только в stdout по явному флагу с предупреждением, в логи не попадает; в тестах только синтетическая константа мастер-секрета. Админ-эндпоинт с 2FA - срез 2.
6. **Открытые пункты раздела 13 контракта (допущения).**
   - Redis без AOF: окно повтора до 60 с после сброса Redis принимается как риск (R111); идемпотентность `eventId` его сужает.
   - `capabilities` (F2): `NULL` или пусто = только `{punishments}`; неизвестные ключи игнорируются и не расширяют права; `punishments-authoritative` и `player-events` включает владелец.
   - Оповещения о всплесках `punishment.created`/`deleted` - срез 2 (R112); в срезе 1 только метрика и лог.
   - Событие источника не LiteBans: в срезе 1 принимается тот же путь, отдельной пометки проверки нет (R113); публичный показ регулирует существующий флаг раздела `/bans` (выключен по умолчанию).
   - `player.*`: публичный показ «онлайн» по uuid запрещён, присутствия в срезе 1 нет.
   - Ключ зеркала `(source, sourceScope, kind, sourceId)`: `BridgeServer.sourceScope` по умолчанию `default`.
7. **Q42 (число серверов) открыт.** Допущение: N серверов, ключ на сервер, лимиты по `key-id`.
8. **Данные.** Миграция на БД не применялась; применение на одноразовой локальной БД делает chief, на production - только владелец (Q28). Деструктива нет; откат - `DROP` новых объектов отдельным решением.

**Consequences.** Срез 1 не принимает сверку: потерянные события наказаний закрываются только срезом 2 (R114). Общий мастер-секрет: компрометация затрагивает все серверы (R115). Таблица `bridge_servers` без секретов, но с метаданными плагина. Риски: R111-R120. Миграция требует обязательного ревью (Q28).

**Дополнение (раунд безопасности, 2026-11-17).** (1) Приём `punishment.*`: `received` (короткая транзакция, атомарный маркер порядка) -> publish вне транзакции -> `applied`; повтор `received` применяется заново; R121 закрыт. (2) M1: счётчик неверных подписей по паре (ip, key-id), верная подпись не блокируется. (3) M3: собственный парсер тела, `BRIDGE_MAX_BODY_BYTES`, 413 и 400 `invalid_body`. (4) L3: строгая проверка энтропии мастер-секрета без вывода значения. (5) L4: формат `pluginVersion`/`platform` в `bridge.hello`. (6) L5: боевая регистрация сервера только флагами `--production --confirm-owner` владельцем. (7) Подписчик зеркала применяет событие в `punishment mirror` со своим `sourceScope`; LiteBans не отключён. Риски R127–R132.

## ADR-0183 — Транзакции Prisma: общие maxWait/timeout и отображение «база занята» в 503

**Status:** Proposed (backend, 2026-11-17). Решение владельца по значениям для production не принято (см. чек-лист production-env).

**Context.** Prisma даёт интерактивной транзакции 2000 мс на старт (`maxWait`) и 5000 мс на выполнение (`timeout`). Под нагрузкой (транзакции под `pg_advisory_xact_lock`, малый пул соединений, вложенные запросы внутри транзакции) это давало `P2028` «Unable to start a transaction in the given time» и клиенту 500. Три случая одного класса: формы (точечный `maxWait: 10_000`), вебхук оплаты заказа (точечный 10_000/10_000), e2e голосования «параллельные голоса — одна награда» (500 P2028 на вебхуке, ADR-0121). Точечные правки не защищают остальные транзакции, а необработанная ошибка Prisma превращается в 500 с записью в лог.

**Decision.**
1. **Общие опции.** `PrismaService` передаёт в `PrismaClient` `transactionOptions: { maxWait, timeout }` из конфигурации: `PRISMA_TX_MAX_WAIT_MS` (1000-30000, по умолчанию 10000) и `PRISMA_TX_TIMEOUT_MS` (1000-60000, по умолчанию 10000), валидация Joi (`env.validation.ts`); вне границ API не стартует. Обоснование значений: 10 с совпадает с `pool_timeout` Prisma по умолчанию и с уже проверенными точечными значениями заказов; верхняя граница ожидания 30 с и timeout 60 с оставляют ответ до таймаута прокси (nginx `proxy_read_timeout` по умолчанию 60 с); нижняя граница 1 с не даёт выключить ожидание. Точечные опции в `forms.service.ts` и `orders.service.ts` убраны (значения совпадали с общими); логика транзакций не менялась.
2. **Где точечные опции остаются.** Приёмник Bridge (`bridge-ingest.service.ts`, 2000/6000) и запись зеркала наказаний (`APPLY_TX_MAX_WAIT_MS`/`APPLY_TX_TIMEOUT_MS`, 2000/6000): там быстрый отказ намеренный - плагин ретраит, а долгое удержание соединения блокирует приёмник (R121, F4). Инвентарь (`prisma-inventory.store.ts`): явные `maxWait: 2000`/`timeout: 5000` (прежние умолчания Prisma) плюс `isolationLevel: Serializable`: при повторе до 4 раз (`P2034`/`P2002`) общие 10 с/10 с дали бы до 80 с удержания запроса плагина, а транзакция короткая и быстрый отказ предпочтительнее.
3. **Глобальный фильтр.** `PrismaExceptionFilter` (`apps/api/src/common/filters`), подключён через `APP_FILTER` в `PrismaModule` (действует и в e2e): `P2028` и `P2024` (нет свободного соединения за `pool_timeout`) -> 503 `{ statusCode: 503, code: 'busy', message }` + `Retry-After: 2`; `P2034` (конфликт записи или взаимоблокировка, транзакция откатана целиком) -> 503 `busy` + `Retry-After: 1`. Для `/bridge/v1` тело `{ error: 'unavailable' }` и `Retry-After: 5` (контракт Bridge, раздел 2.3). Прочие коды Prisma -> 500 `Internal server error` без деталей, с записью в лог. Текст ошибки и `meta` клиенту не отдаются.
4. **Повтор при P2034.** Автоматический повтор остаётся только там, где он уже есть (инвентарь, Serializable). Для остальных транзакций повтор принадлежит клиенту: транзакция откатана целиком, значит повтор безопасен, а 503 с `Retry-After` его запрашивает. 409 не используется: конфликт записи - сбой сервера, а не ошибка клиента.
5. **Специфичная обработка не нужна.** Повтор `externalId` в голосовании остаётся `P2002` -> 200 `duplicate` (ADR-0121, уже в `voting.service.ts`); формы (ADR-0122) и вебхук оплаты при занятой базе получают общий 503. Вебхук оплаты: платёжный провайдер ретраит не-2xx, бизнес-логика заказа не менялась.
6. **Пул.** `connection_limit` и `pool_timeout` задаются в `DATABASE_URL` владельцем; рекомендация и обоснование - `docs/runbooks/production-env-checklist.md`. Агенты `.env` не правят.

**Consequences.** Ответ при перегрузке - 503 `busy` вместо 500; клиенты (web, плагины, платёжные провайдеры) должны уважать `Retry-After`. Больший `maxWait` увеличивает время удержания запроса под перегрузкой до 10 с вместо 2 с: это осознанный размен на меньше ошибок; защита от лавины - лимиты запросов и пул. Нет метрик занятости пула (R141). Сопоставление кодов Prisma с 503 доказано юнит-тестами фильтра; e2e исчерпания пула НЕ доказан: попытка (`prisma-busy.e2e-spec.ts`) падала с pool timeout при старте приложения, файл удалён из ветки. Дизайн повторной попытки (отдельная задача, только после разрешения владельца на прогон e2e): `pool_timeout=20` как в `bridge.e2e-spec.ts:626`; проверять путь P2028 на транзакционном запросе вебхука голосования или формы; удерживать `POOL_SIZE-1` соединений заложниками; учесть фоновые планировщики, занимающие соединения при старте. Приёмник Bridge (`bridge.controller.ts:106-111`) и до этого отвечал 503 `unavailable` с `Retry-After: 5` при любой ошибке БД; фильтр добавляет ту же форму для кодов Prisma, не пойманных контроллером.

## ADR-0184 — Слой доставки купленного: DeliveryService и заменяемые исполнители

**Status:** Proposed (Product & Design Director, 2026-11-17; дорожка B, подэтапы 0.7 и 0.11 плана v1.1). Принимает chief после независимого ревью. Кода и миграций нет; реализация — отдельные срезы 0.7, 0.11, 0.13, 0.15. Изменено по ревью Q&S 2026-11-18 (раздел перед «Consequences»; приоритетен). **Accepted (chief, 2026-11-18, по независимому ревью Q&S и правкам f150e7d).**

**Context.** Код: `OrderItem.isDelivered` и `Product.gameCommands` нигде не используются, кроме схемы и DTO; `handleWebhook` (ADR-0157) переводит `PENDING -> COMPLETED` и на этом заканчивает; `refund()` только ставит `REFUNDED`. Владелец (промпт 12, пп. 2, 4, 8): каждый товар выдаётся командой на игровой сервер без сложной логики, но через отдельный слой с заменяемыми исполнителями («команда на сервер», позже Bridge); шаблоны команд правит только отдельное право владельца с 2FA и аудитом, подставляются только разрешённые переменные; возврат до выдачи на исходный способ, после выдачи нет (безопасное допущение до ответа владельца). Правила ADR-0157 (вебхук идемпотентен, всегда 200 для проверенных событий) не меняются: доставка не должна ни замедлять, ни ронять вебхук.

**Decision.**

1. **Заказ не знает, чем выдаётся товар.** Между оплатой и результатом стоит `DeliveryService` над интерфейсом `DeliveryExecutor`. Контракт (форма, не реализация):
   - `kind`: `command` | `manual` | `wallet` | `bridge`;
   - `execute(task): Promise<DeliveryResult>`; результат — закрытый набор: `delivered` (с необязательной внешней ссылкой), `retry` (известно, что НЕ выполнено; причина; необязательная пауза), `failed` (окончательный отказ), `unknown` (команда могла уйти, подтверждения нет), `awaiting_manual` (ждёт человека).
   - Исполнитель не читает заказ сам: получает снимок задания (ник, готовые аргументы, идемпотентный ключ), не получает ни секретов других исполнителей, ни данных покупателя, кроме ника.
2. **Исполнители.** `command` — первый боевой: отправляет одну команду через транспорт `CommandTransport` (RCON или плагин; выбор транспорта в этом ADR НЕ фиксируется: интерфейс `send(command): Promise<TransportAck>`). `manual` — запасной: задание ждёт, админ отмечает «выдано». `wallet` — для CURRENCY (0.15, проводка в журнал кошелька с источником `PURCHASE`, см. ADR-0185 п. 5). `bridge` — позже (0.13): задание с ключом идемпотентности и подтверждением сервера; при тайм-ауте исполнитель возвращает `unknown`, а не `retry`. Исполнитель товара выбирается настройкой товара или варианта (`deliveryExecutor`), по умолчанию `manual`, а не `command`: без явного выбора ничего не уходит на сервер.
3. **Очередь заданий.** Новая таблица `delivery_tasks` (expand-only миграция, на production применяет владелец, Q28/Q43): `orderItemId`, `step` (номер команды шаблона), `executor`, `status`, `attempts`, `nextAttemptAt`, `leaseUntil`, снимок `nick`, `renderedCommand` (после подстановки, для аудита; без секретов), `lastError` (очищенный текст, без токенов и паролей), `deliveredAt`. Ключ идемпотентности: `UNIQUE (orderItemId, step)`. Задания создаются в ТОЙ ЖЕ транзакции, что и переход `PENDING -> COMPLETED` в `handleWebhook`, только при `moved.count === 1` (outbox): повторный вебхук ничего не создаёт, сбой выдачи не откатывает оплату. Для `quantity > 1` количество передаётся переменной `{amount}`, а не размножением заданий.
4. **Статусы.** `PENDING -> IN_PROGRESS -> DELIVERED`; `RETRY_WAIT` (известный сбой до отправки, с `nextAttemptAt`); `FAILED` (попытки исчерпаны или окончательный отказ); `NEEDS_ATTENTION` (исход `unknown` либо неприменимо); `AWAITING_MANUAL`; `MANUAL_DONE`; `CANCELLED` (возврат до выдачи). `OrderItem.isDelivered` и `deliveredAt` выводятся из заданий и пишутся в транзакции последнего перехода позиции в `DELIVERED` или `MANUAL_DONE`. Переходы проверяются условным `updateMany` по текущему статусу (как в ADR-0157), недопустимые игнорируются без исключения.
5. **Воркер.** Опрос с захватом `FOR UPDATE SKIP LOCKED` и арендой `leaseUntil`; просроченная аренда возвращает задание в `PENDING` ТОЛЬКО для идемпотентных шаблонов, иначе в `NEEDS_ATTENTION`. Повторы: экспоненциальная пауза (1, 5, 30 минут, затем 2 часа), потолок попыток по настройке (по умолчанию 5), после — `FAILED` и уведомление админам. Лидерство не нужно: захват строки достаточен.
6. **Семантика «не более одного раза» для команд.** У RCON нет дедупликации: повтор команды после тайм-аута может выдать товар дважды. Поэтому тайм-аут после отправки или разрыв до ответа = `unknown` -> `NEEDS_ATTENTION` без автоповтора (админ проверяет в игре и отмечает выдачу или повторяет вручную). Автоповтор допускается только для (а) сбоя ДО отправки (отказ соединения, транспорт выключен) и (б) шаблонов с признаком `idempotent` (например, «установить группу», но не «выдать N ключей»). Признак ставит владелец вместе с шаблоном; по умолчанию `false`.
7. **Шаблоны игровых команд.**
   - Хранение: настройка сайта или таблица шаблонов, привязанная к варианту товара; список команд упорядочен (`step`).
   - Право: новое `store.delivery.templates.manage` (имя предварительное), выдаётся только владельцу (суперпользователю), в стандартные роли не входит. Каждое изменение требует (а) включённой 2FA у автора и (б) свежего TOTP-кода в теле запроса (повторное предъявление кода не принимается, `twoFactorLastStep`, ADR-0109); без кода 403. Запись в `AuditLog` с `severity = critical`: прежний и новый текст целиком (шаблон не содержит секретов), автор.
   - Разрешённые переменные — закрытый список: `{nick}` (ник получателя, снимок на момент оформления; проверка `^[A-Za-z0-9_]{3,16}$`; ники Bedrock/Floodgate с точкой и пробелом на этом этапе не поддерживаются, допущение), `{term}` (целое 0-3650 из данных варианта, не из ввода покупателя), `{amount}` (целое 1-100000 из позиции заказа), `{orderNumber}` (системный номер заказа вида `O-YYYYMMDD-XXXXXX`; нужен для записи причины снятия, ADR-0186). Это расширение списка «ник, срок» из промпта 12 системными значениями: допущение, вынесено в отчёт.
   - Подстановка: шаблон разбирается на токены ДО подстановки; значение подставляется целиком в один токен и повторно проверяется по своей регулярке. Перевод строки, управляющие символы, точка с запятой, амперсанд, вертикальная черта, обратный апостроф, знак доллара и кавычки в значениях невозможны уже по этим регуляркам. Незнакомая переменная при сохранении шаблона = 422, при исполнении = `failed` без отправки. Длина итоговой команды не более 256 символов.
   - Запрет произвольных команд: что выполняется, определяется только шаблоном варианта купленной позиции; от клиента в команду попадают лишь проверенный ник и `variantId`. Дополнительно (защита в глубину, не граница доверия) шаблон при сохранении отвергается, если первый токен входит в закрытый запретный список (остановка и перезапуск сервера, выдача прав оператора, `execute`, массовая смена прав и т.п.); список — в конфигурации, пополняется только владельцем.
   - Предпросмотр: подстановка тестового ника без отправки.
8. **Связь с возвратом (допущение промпта 12 п. 8).** Возврат ДО выдачи: в одной транзакции `updateMany` переводит задания позиций в `CANCELLED` (из статусов `PENDING`, `RETRY_WAIT`, `FAILED`, `AWAITING_MANUAL`); при задании `IN_PROGRESS` или `NEEDS_ATTENTION` возврат отвечает 409 `delivery_in_progress` (админ дожидается исхода или отмечает вручную; гонка «возврат и выдача» решается блокировкой строк заданий). Деньги возвращаются на исходный способ ТОЛЬКО методом провайдера; в интерфейсе `PaymentProvider` его сейчас нет (подэтап 0.9), поэтому до 0.9 `refund()` остаётся записью статуса, и ADR возврат денег не обещает. Возврат ПОСЛЕ выдачи (любая позиция заказа в `DELIVERED` или `MANUAL_DONE`): по умолчанию запрещён (409 `refund_after_delivery`); политика `refund.afterDelivery` (`deny` или `manual_review`) — конфигурацией, с аудитом изменения. Выданное не отзывается: метода отзыва в `DeliveryExecutor` нет (расширение отдельным ADR). Размут и Разбан после снятия не откатываются (ADR-0186). Юридическая сторона политики возвратов — «требует решения владельца».
9. **Флаги.** `STORE_DELIVERY_ENABLED` (по умолчанию `false`): воркер не берёт задания; оплата и `COMPLETED` работают, задания копятся как `PENDING` или `AWAITING_MANUAL`, заказ показывает «ожидает выдачи». Отдельные настройки: включён ли каждый исполнитель (`command` по умолчанию выключен), потолок попыток, паузы. Выключение без деплоя; повторное включение разбирает накопленное по порядку создания.
10. **Аудит и видимость.** `AuditLog` для: изменения шаблона, ручной отметки, ручного повтора, отмены, смены исполнителя товара, переключения флагов и политик (`severity` info, для шаблонов и политики возврата — critical). Админ видит статус выдачи по позиции, число попыток и очищенную ошибку; игрок — только «ожидает выдачи / выдано / требуется внимание поддержки». Сырые ответы RCON или плагина игроку не отдаются.
11. **Порядок реализации.** 0.7 (интерфейс, очередь, `manual`, `command` за флагом) -> 0.11 (шаблоны, право, настройки) -> 0.15 (`wallet`) -> 0.13 (`bridge`). Интерфейс и очередь пишутся так, чтобы добавление исполнителя не меняло таблиц и заказа.

**Изменено по ревью Q&S 2026-11-18.** Независимое ревью Q&S дало обязательные правки ниже. Исходные пункты выше сохранены без удаления; при расхождении действует этот раздел. Статус остаётся Proposed.

Р1. **Обход права на шаблоны через `Product.gameCommands`.** Поле есть в схеме и принимается `CreateProductDto` и `UpdateProductDto` (`create-product.dto.ts:102`, `update-product.dto.ts:89`): админ с правом на товары мог бы записать туда команды в обход `store.delivery.templates.manage`. Правило: `DeliveryService` и любой исполнитель НИКОГДА не читают `Product.gameCommands`; единственный источник команд — хранилище шаблонов (Р8). DTO создания и обновления отвергает поле (422) или игнорирует его без записи (при реализации выбрать одно и покрыть тестом); существующие значения не исполняются. Колонка удаляется отдельной contract-миграцией позже, по правилам Q44 (после проверки, что поле нигде не используется); в этом ADR миграции нет.

Р2. **Проверка первой команды (дополняет п. 7).** Основа — allowlist первых токенов (например `lp`, `give`; список в конфигурации, пополняет только владелец); denylist (остановка и перезапуск, права оператора, `execute`, массовая смена прав) — дополнение, а не основа. Перед сравнением токен нормализуется: снять ведущий `/`, нижний регистр, снять префикс пространства имён (`minecraft:`, `bukkit:` и т.п.), раскрыть известные алиасы команд. Литералы шаблона (текст вне переменных) проверяются на `;`, `&`, `|`, обратный апостроф, `$`, перевод строки и управляющие символы: любой из них при сохранении = 422. Шаблон без команды из allowlist не сохраняется.

Р3. **Заморозка шаблона.** Шаблон рендерится при СОЗДАНИИ задания (в транзакции вебхука), результат хранится в `renderedCommand`; версия шаблона (`templateVersion`) хранится в задании. Правка шаблона после оплаты не меняет уже созданные задания. Воркер отправляет только `renderedCommand` и не перечитывает шаблон.

Р4. **Частичная выдача (многошаговые шаблоны).** Возврат запрещён (409), если ЛЮБОЕ задание позиции находится в `DELIVERED`, `MANUAL_DONE`, `IN_PROGRESS` или `NEEDS_ATTENTION`. Шаг N+1 не стартует, пока шаг N не в `DELIVERED` (или `MANUAL_DONE`). Позиция с частично выданными шагами решается только вручную админом с аудитом.

Р5. **Порядок возврата (уточняет п. 8).** (1) в транзакции блокируются строки заданий позиции и они переводятся в `CANCELLED` (при условиях Р4); (2) только после фиксации этой транзакции вызывается провайдер оплаты; (3) при отказе провайдера выполняется компенсация: задания не возрождаются автоматически, заказ получает пометку «возврат не прошёл», админ решает вручную (повторный возврат либо ручная выдача), всё с аудитом. Обратный порядок (сначала провайдер, затем отмена) запрещён: он допускает выдачу уже возвращённого товара.

Р6. **Аренда и поздний результат (уточняет пп. 5-6).** Каждый захват задания выдаёт токен аренды и увеличивает номер попытки; результат исполнителя принимается, только если токен совпадает с текущим. Поздний результат для задания в `NEEDS_ATTENTION` принимается при совпадении токена последней попытки (перевод в `DELIVERED` или `FAILED`), иначе игнорируется и пишется в аудит. Ручной повтор задания из `NEEDS_ATTENTION` требует явного подтверждения админа («команда могла уже выполниться»), с аудитом. Длительность аренды строго больше тайм-аута транспорта (с запасом), иначе задание уйдёт в `NEEDS_ATTENTION` ещё до окончания попытки.

Р7. **Исполнитель `wallet` (уточняет п. 2).** Применим только к `CURRENCY`. Зачисление идемпотентно по `(orderItemId, step)` и выполняется в ОДНОЙ транзакции со сменой статуса задания на `DELIVERED` (повторный запуск не даёт второй проводки). Количество рубинов считается от фактически оплаченной суммы позиции в рублях (целое, 1 ₽ = 1 рубин) и никогда не берётся из поля товара, редактируемого админом (например, «количество рубинов» или `{amount}` из ввода). Выбор консервативный: если оплаченная сумма позиции не равна каталожному номиналу (скидка, промокод), зачисление НЕ выполняется, задание получает `NEEDS_ATTENTION` с причиной `amount_mismatch`; по ADR-0185 Р2 промокоды на рубины не действуют, поэтому расхождение означает сбой. Допущение вынесено в отчёт.

Р8. **Хранилище шаблонов (уточняет п. 7).** Шаблоны хранятся в отдельной таблице или защищённой настройке, запись в которую невозможна через общий API настроек сайта и через seed (запись через них отвергается на уровне сервиса настроек). Единственный путь записи — отдельный эндпоинт с правом `store.delivery.templates.manage`, включённой 2FA и свежим TOTP (ADR-0109); критичный аудит.

Р9. **Ник (уточняет п. 7).** Ник повторно проверяется регуляркой `^[A-Za-z0-9_]{3,16}$` на этапе delivery (при создании задания и при отправке), а не только при оформлении. Зарезервированные слова и селекторы (`all`, `*`, `@a`, `@e`, `@p`, `@r`, `@s`) как значение `{nick}` отвергаются (особенно для шаблонов с селекторами), сравнение без учёта регистра. DTO гостевого ника выравнивается с регуляркой (сейчас длина 1-16): `{3,16}` и тот же набор символов совпадают в DTO, в подэтапе 0.7 и в подэтапе 0.12.

Р10. **Флаг доставки (заменяет формулировку «без деплоя» в п. 9).** Выбор: `store.delivery.enabled` — настройка БД (по умолчанию `false`), воркер читает её при каждом опросе (кэш не более 30 секунд), поэтому включение и выключение действуют без перезапуска и без деплоя. Переменная окружения `STORE_DELIVERY_ENABLED` остаётся жёстким аварийным запретом: если она явно `false`, доставка выключена независимо от настройки (смена переменной требует перезапуска, поэтому «без деплоя» к ней НЕ относится). Доставка идёт, только если разрешают оба. Каждое изменение настройки — аудит. Было: «`STORE_DELIVERY_ENABLED` (по умолчанию `false`) ... Выключение без деплоя» (п. 9 выше).

**Требования к реализации (подэтапы 0.7 и 0.11).**
- 0.7: таблица `delivery_tasks` с токеном аренды, номером попытки, `templateVersion`, `renderedCommand`; тест конкуренции двух воркеров (`SKIP LOCKED`); тест «поздний результат при NEEDS_ATTENTION»; тест «шаг N+1 не стартует до DELIVERED шага N»; тест порядка возврата (отмена до вызова провайдера) и компенсации при отказе провайдера; тест гонки «возврат против выдачи»; тест, что `Product.gameCommands` не читается и отвергается DTO.
- 0.7: повторная проверка ника (Р9) при создании задания и при отправке; `all`, `*` и селекторы отвергаются.
- 0.11: allowlist первого токена, нормализация, проверка литералов (Р2) с табличными тестами обходов (`/LP`, `minecraft:op`, `a;b`, перевод строки, `$(...)`); единственный эндпоинт записи шаблонов с 2FA и свежим TOTP; тест, что общий API настроек и seed не пишут шаблоны; тест идемпотентного `wallet` по `(orderItemId, step)` и несовпадения суммы.
- 0.7 и 0.11: `store.delivery.enabled` читается из БД (тест включения без перезапуска); аудит всех изменений настроек и ручных действий.

**Consequences.** Оплата отделена от выдачи: сбой сервера не теряет заказ и не блокирует вебхук. Цена — очередь, воркер, таблица и обязательный человек для `unknown`. «Не более одного раза» может оставить оплаченный заказ без выдачи до проверки админом; это лучше двойной выдачи привилегии или рубинов (R143). Шаблоны — самая чувствительная настройка проекта: компрометация владельца равна выполнению команд на серверах (R144); 2FA и свежий код снижают, но не снимают риск. Без возврата денег через провайдера (0.9) возврат остаётся ручным (R148). Транспорт (RCON или плагин) и его учётные данные — решение и значения владельца; агенты ключей не создают. При `STORE_DELIVERY_ENABLED=false` поведение сайта не меняется.


### Реализация 0.7 (дополнение 2026-11-18, промпт 15)

- Механизм: транзакция вебхука оплаты только переводит заказ в COMPLETED; после коммита победитель перехода создаёт задания выдачи минимальной вставкой (createMany со skipDuplicates по UNIQUE(orderItemId, step)), без внешних вызовов и чтения шаблонов. Ошибка этой вставки пишется в лог и не откатывает оплату.
- Фоновая сверка (delivery-reconcile.scheduler): раз в 60 с, пачка 50, заказы COMPLETED, оплаченные от 60 с до 72 ч назад, без заданий у позиции; каждый заказ в своей транзакции под pg_try_advisory_xact_lock; тем же идемпотентным путём; флаг DELIVERY_RECONCILE_ENABLED (по умолчанию включена). Аудит не пишется (нет актора, операция идемпотентна), число созданных — в лог.
- Почему не savepoint внутри транзакции оплаты: падение процесса между коммитом и вставкой всё равно требует сверки; разделение гарантирует, что ошибка выдачи не влияет на статус оплаты.
- Ограничения: окно 72 ч (Q87); критерий «у позиции нет ни одного задания» верен для одного шага — расширить при многошаговых шаблонах (0.11).

## ADR-0185 — Ограниченное снятие gate 05–06: продажа и выдача групп и товаров командой

**Status:** Proposed (Product & Design Director, 2026-11-17; подэтап 0.11). Это ограниченное снятие hard gate, данное владельцем в промпте 12 п. 2; ADR только фиксирует границы и механизм, расширять его может лишь владелец. Дополняет ADR-0184; не меняет `docs/donations/REQUIREMENTS.md` и roadmap. Изменено по ревью Q&S 2026-11-18 (раздел перед «Consequences»; приоритетен). **Accepted (chief, 2026-11-18, по независимому ревью Q&S и правкам f150e7d).**

**Context.** Требования Donation Privileges (`docs/donations/REQUIREMENTS.md`: уровни, сравнение, шансы, перки, системы) и Level System остаются под hard gate (CLAUDE.md, `docs/decisions/OWNER-ECONOMY-AND-CONTESTS.md`). Владелец ограниченно разрешил обычный магазин по нику: каждый товар продаётся и выдаётся командой на игровой сервер без отдельной сложной логики; без шансов x2/x3 и без перков, которых ещё нет; донат-бонусов в азартных механиках нет. Бейджи и украшения профиля отложены до готовности профиля. План v1.0 запрещал выдачу PRIVILEGE, SUBSCRIPTION, BATTLE_PASS; v1.1 это снял в рамках каталога ниже.

**Decision.**

1. **Разрешено.** Продажа товара и его выдача командой или шагами шаблона через слой доставки (ADR-0184). Каталог слоя 0 (цены владельца, промпт 12 п. 2):
   - 7 привилегий (`PRIVILEGE`): Полемизм от 1499 ₽, Сварог от 799, Кратос от 599, Аполон от 399, Деймос от 299, Арес от 129, Гефест от 39; «от» = минимальный вариант;
   - 3 ключа кейсов (`KEY`): Донат кейс 89, Титульный кейс 19, Рубиновый кейс 79; кейсы открываются в игре, сайт продаёт ТОЛЬКО ключи;
   - Размут 89 (`UNMUTE`) и Разбан 199 (`UNBAN`) — правила в ADR-0186;
   - Рубины (`CURRENCY`), 1 ₽ = 1 рубин;
   - Боевой пропуск премиум 299 (`BATTLE_PASS`): выдача группы или флага командой.
   Цены и варианты — данные админки (0.3, 0.11), не код и не seed на production; перечень выше — ориентир для заведения, а не источник цен.
2. **Закрытый список типов.** Продаваемые типы фиксируются настройкой `store.sellableTypes` (по умолчанию `PRIVILEGE`, `KEY`, `UNMUTE`, `UNBAN`, `CURRENCY`, `BATTLE_PASS`). Товар типа вне списка (`BADGE`, `DECORATION`, `SUBSCRIPTION`, `BATTLE_PASS_BOOSTER`) нельзя активировать: сервер отвечает 422 при `isActive = true`. Расширить список может только владелец отдельным решением; изменение пишется в аудит как critical.
3. **Запрещено (остаётся под hard gate; в код и данные не вводится):**
   - шансы и множители x2/x3 и любые другие множители выигрыша или шанса, в том числе как «перк привилегии»;
   - перки, которых в игре ещё нет: описываются ТОЛЬКО реально работающие;
   - донат-бонусы в азартных механиках (кейсы, рулетка, краш, апгрейдер и т.п.): ключ кейса — обычный товар, шанс выпадения от привилегии не зависит;
   - бейджи и украшения профиля как товары (до готовности профиля);
   - Level System, мини-игры, конкурсы, розыгрыши (в том числе платные билеты), передача рубинов, вывод рубинов в рубли;
   - реализация возможностей привилегий на сайте (комплекты, цвета, сравнение уровней по требованиям) сверх «выдать группу командой»: страница сравнения привилегий НЕ входит; карточка товара показывает название, цену, вариант и настроенное описание.
4. **Перки и тексты — конфигурацией.** Описание привилегии и перечень перков — поле товара и настройка `perks.<productSlug>` (текст, редактируется админом с правом на товары, аудит). Структурированных полей «множитель», «шанс», «бонус» в схеме не создаётся. Принцип контроля: перк попадает в публичный текст только после подтверждения, что он работает (владелец или лид, запись об этом в аудите изменения текста). Автоматически содержимое не проверить, поэтому это организационное правило, а не техническая гарантия (R150). Что «даёт каждая привилегия» и что значит «от» (срок, варианты, доплата при апгрейде) — отложенный вопрос «Вернуться в конце слоя 0».
5. **Рубины (`CURRENCY`).** Выдаются исполнителем `wallet` (ADR-0184) проводкой в журнал кошелька (0.15) с источником `PURCHASE` и количеством равным рублям (1:1, целое). Источник сохраняется для будущего раздельного учёта «выигранной» части (OWNER-ECONOMY 2.2); передача, вывод в рубли и трата в играх случая в слой 0 не входят. Кошельку нужен аккаунт: в гостевом quick-buy `CURRENCY` не продаётся (ADR-0186). Противоречие источников: промпт 12 («каждый товар командой») и подэтап 0.15 («через кошелёк»). Допущение: рубины зачисляются на кошелёк сайта; если рубины должны быть игровой валютой, исполнитель товара меняется настройкой на `command` без правки заказа.
6. **Включение в production.** Товары создаются неактивными (`isActive = false`); включает админ с правом на товары, а UNBAN и UNMUTE — только после списка нарушений от владельца (ADR-0186). Вместе с выключенным `STORE_DELIVERY_ENABLED` это три независимых выключателя: тип, товар, исполнитель.
7. **Трассировка.** Промпт 12 п. 2 -> пп. 1-3; п. 4 -> пп. 4, 6; Donation Privileges и Level System остаются закрытыми (п. 3). Roadmap не менялся.

**Изменено по ревью Q&S 2026-11-18.** Правки ниже обязательны; исходные пункты выше не удалены. Статус остаётся Proposed.

Р1. **`store.sellableTypes` проверяется не только при активации (уточняет п. 2).** Проверка выполняется на сервере: при активации товара, при добавлении в корзину, при оформлении заказа (включая quick-buy), при смене типа активного товара (смена на тип вне списка при активном товаре отвергается либо деактивирует товар с аудитом). Для уже существующих товаров запрещённых типов добавляется одноразовый скрипт или миграция деактивации (`isActive = false`, запись в аудит): создаётся и проверяется на одноразовой локальной БД, на production применяет только владелец; seed на production не используется. Было: проверка при активации (п. 2 выше).

Р2. **Рубины при скидке и промокоде (уточняет п. 5).** Консервативное правило: рубины начисляются по номиналу товара (1 ₽ = 1 рубин от каталожной цены варианта), а промокоды и скидки на товары `CURRENCY` не действуют (сервер отвергает промокод для позиции `CURRENCY`). Обоснование: иначе рубины, соответствующие деньгам 1:1, можно получить со скидкой, а будущий раздельный учёт (OWNER-ECONOMY 2.2) требует точного «оплачено = начислено». Исполнитель `wallet` дополнительно сверяет оплаченную сумму с номиналом (ADR-0184 Р7). Допущение вынесено в отчёт; если владелец захочет скидки на рубины, правило меняется на «начисление по оплаченной сумме».

Р3. **Чек-лист включения товара с записью в аудит (уточняет п. 6).** Перед первой активацией товара админ проходит чек-лист: описание соответствует реально работающему; шаблон выдачи проверен предпросмотром и на тестовом сервере; исполнитель выбран; цена и варианты верны; перк подтверждён владельцем или лидом; для UNBAN и UNMUTE выполнены правила ADR-0186. Активация без отметки чек-листа отвергается; подтверждение (кто, когда, версия шаблона, пункты) записывается в `AuditLog`. Это организационная мера, а не доказательство содержимого (R150).

**Требования к реализации (подэтап 0.11).** Тесты: товар запрещённого типа не добавляется в корзину, не оформляется и не активируется; смена типа активного товара; промокод на `CURRENCY` отвергается; активация без чек-листа отвергается, при успехе пишется аудит; скрипт деактивации идемпотентен.

**Consequences.** Магазин запускается без разработки Donation Privileges и новых игровых систем. Запрет на несуществующие перки держится процессом и закрытым списком типов, а не автоматикой (R150); текст товара — самое слабое место с точки зрения жалоб покупателей. Если владелец позже даст полноценный Donation Privileges, товары и шаблоны остаются, меняются описания и добавляется логика поверх. Апгрейд привилегии (доплата) не реализуется: повторная покупка другого уровня выдаётся тем, что говорит шаблон; автоматического зачёта нет и он не обещается. Любое требование из «запрещено» возвращается к владельцу как новый scope.

## ADR-0186 — Быстрая покупка по нику без входа и платное снятие бана/мута

**Status:** Proposed (Product & Design Director, 2026-11-17; подэтап 0.12, части 0.12a и 0.12b). Содержит ИСКЛЮЧЕНИЕ к правилу иерархии снятия санкций (ADR-0173, Q48/Q49): принимать только с решением владельца (промпт 12 п. 3 требует отдельного ADR-исключения). Изменено по ревью Q&S 2026-11-18: п. 9 НЕ ПРИНИМАЕТСЯ без решения владельца (Q79); раздел перед «Consequences» приоритетен. **Accepted частично (chief, 2026-11-18): пункты 1–8 и Р1–Р8 приняты; пункт 9 (платное снятие бана/мута, исключение к ADR-0173) — Proposed до решения владельца Q79.**

**Context.** `POST /store/quick-buy` анонимен (ADR-0038), лимит 10/мин (Q13, ADR-0157). Сейчас: проверки существования ника нет (`guestMinecraftNick`, 1-16 символов); DTO принимает `contactEmail`, но `createOrderFromLines` его не сохраняет; `getByOrderNumber` требует `userId`, у гостя нет способа увидеть заказ; номер заказа `O-YYYYMMDD-` плюс 3 случайных байта (около 16,8 млн вариантов в сутки) подбираем. Владелец (промпт 12 п. 3): quick-buy включён по нику с проверкой существования ника и лимитом Q13; товары снятия бана и мута включены; до списка нарушений снятие бана за деньги допускается «только как система от имени владельца, с записью номера заказа». Наказания читаются из LiteBans в зеркало (ADR-0166, ADR-0178), сайт их НЕ пишет; Q31: IP и контакты нигде не публичны.

**Decision.**

A. Быстрая покупка по нику.

1. **Источник истины существования ника.** Интерфейс `NickResolver.resolve(nick)` возвращает `{ uuid, canonicalName }` или `null`; цепочка источников, порядок задаёт настройка `quickBuy.nickSources`: (1) известные сайту: `MinecraftAccount.name` и имена субъектов зеркала наказаний (без сети); (2) реестр «известных игроков», пополняемый событиями `player.join` Bridge (включает владелец, `features.player_events`; нужна новая таблица `known_players`, expand-only; в событии есть `onlineMode`); (3) API Mojang — ТОЛЬКО если владелец подтвердил online-mode; это внешний вызов, по умолчанию выключен. Один Mojang не выбран: сервер может быть offline-mode, а Mojang не знает ники Bedrock; существование ника для игры определяет сервер. Если ни один источник не включён, quick-buy работает fail-closed (503 `quick_buy_unavailable`), а не «любой ник подходит». Допущение: до подключения источника (2) в production quick-buy выключен флагом.
2. **Защита от перебора ников и утечки факта существования.** Оценены варианты: (A) открытая ручка «проверить ник» с лимитом — дешёвый оракул существования, отвергнута; (B) проверка только внутри оформления с одинаковым ответом на «нет такого ника» и «ник недоступен для этого товара», плюс счётчики и Turnstile; (C) проверка после оплаты — отвергнута (деньги берутся за неизвестного получателя). Выбран B. Полностью скрыть факт существования нельзя: требование «несуществующий ник не оформляется» его раскрывает; задача — сделать перебор дорогим и неинформативным:
   - отдельной ручки проверки нет; проверка выполняется внутри `POST /store/quick-buy` и возвращает лишь «оформлено» или отказ (не отдаются uuid, скин, дата захода, наличие аккаунта, наличие бана); в отказе один код `nick_unavailable` и один текст;
   - лимиты: 10/мин на IP (Q13, сохраняется; по `req.ip`, ADR-0157), дополнительно 30 отказов `nick_unavailable` в час на IP, 10 запросов в час на один ник (по хешу ника) и общий потолок проверок в минуту для всего сайта; значения — настройки; превышение = 429 без деталей;
   - после 3 отказов `nick_unavailable` с одного IP за 10 минут требуется Turnstile (инфраструктура есть: `TURNSTILE_*`); без токена 429 `challenge_required`;
   - шаг «подтвердите ник» показывает введённый (а не найденный) ник; регистр нормализуется по каноническому имени источника;
   - счётчики и IP хранятся только в Redis с TTL (не в `Order`, не в логах заказов), ник в метриках не пишется.
3. **Что хранится при оформлении без аккаунта.** `Order`: `userId = NULL`, `guestMinecraftNick` (каноническое имя), состав, суммы, номер, платёжные идентификаторы (как сейчас), время. Новое: `guestAccessTokenHash` (SHA-256 секретного токена не менее 128 бит, base64url; токен возвращается ОДИН раз в ответе оформления и встроен в ссылку страницы заказа; в БД и логах только хеш; срок жизни 30 дней, настройка). Не хранятся: IP, user-agent, адрес покупателя, телефон. `contactEmail` из DTO в 0.12a принимается, но НЕ сохраняется (допущение: нужен ли чек и e-mail, зависит от провайдера и статуса самозанятого — отложенные вопросы); если владелец потребует, появится отдельная таблица с ограниченным сроком хранения (ПДн, оферта — вопрос владельцу). Номер заказа остаётся идентификатором для поддержки и записи снятия, но доступа не даёт.
4. **Страница заказа без входа.** `GET /store/orders/guest/:token`: поиск по хешу, лимит 60/мин на IP; ответ — статусы заказа и выдачи, названия позиций, ник; без внутренних id, платёжных данных и `paymentUrl`. Чужой заказ по угаданному номеру недоступен (тест в 0.12). Страница отдаётся с `Referrer-Policy: no-referrer` и `Cache-Control: no-store`, токен не логируется.
5. **Что можно покупать без входа.** Настройка `quickBuy.allowedTypes` (по умолчанию `PRIVILEGE`, `KEY`, `UNMUTE`, `UNBAN`, `BATTLE_PASS`; `CURRENCY` нет — кошельку нужен аккаунт). Аварийный выключатель quick-buy — настройка или модуль без деплоя. Оплаченный гостевой заказ доставляется по снимку ника через `DeliveryService` (ADR-0184).

B. Платное снятие бана и мута (UNBAN, UNMUTE).

6. **Что снимается.** Только наказания игрового сервера (бан и мут из LiteBans по зеркалу, ADR-0178) для ника получателя на момент оплаты и на момент выдачи. НЕ снимаются никогда этим путём: бан или блокировка аккаунта на сайте (`User.isBanned`), бан чата сайта, бан обращений (`ReportBan`), IP-бан, предупреждения и кики (нечего снимать), наказание, выданное владельцем (суперпользователем) или с неизвестным выдавшим — до отдельного решения владельца. Эти запреты — жёсткий минимум в коде (защитный пол), остальное — конфигурация.
7. **Правила снятия — конфигурацией.** Настройка `punishments.paidRemoval`: разрешённые категории или шаблоны причин (список шаблонов LiteBans или категорий причин, Q59), запрещённые категории, минимальный и максимальный возраст наказания, лимит платных снятий на ник за период, включение UNBAN и UNMUTE по отдельности. Список нарушений, за которые снятие за деньги не допускается, и лимиты — отложенный вопрос владельца. **Консервативное умолчание до получения списка: список разрешённых пуст, то есть снятие не допускается ни для одной причины; оба товара остаются неактивными и не продаются.** Включение — два действия владельца: заполнить правила и активировать товар. Это строже промпта 12 («допускается как система от имени владельца»): допущение, что допуск без списка небезопасен; при другом ответе достаточно включить товар с правилом «любая причина, кроме запрещённых».
8. **Проверка до оплаты и до выдачи.** При оформлении: ник существует (п. 1), у него есть активное наказание нужного вида, оно подпадает под правила (п. 7); иначе единый отказ `nick_unavailable` (без различения «нет бана» и «бан не снимается»; сам факт бана публичен на `/bans`, а причина «не снимается» наружу не отдаётся). Те же проверки повторяются при исполнении задания. Если при выдаче снятие уже неприменимо (наказание снято, истекло или изменилось), задание получает `NEEDS_ATTENTION` с причиной `not_applicable`; возврат ДО выдачи по ADR-0184 п. 8 — ручное решение админа, не автоматическое; заказ показывает «снятие недоступно, обратитесь в поддержку».
9. **ИСКЛЮЧЕНИЕ к ADR-0173 (Q48/Q49), строгая формулировка.**
   - Правило ADR-0173 (`evaluateSanctionRevoke`, иерархия, «выдавший неизвестен — только владелец») относится к ДЕЙСТВУЮЩЕМУ ЧЕЛОВЕКУ и остаётся без изменений для всех человеческих путей (админка, массовое снятие, обращения, чат). Платное снятие НЕ способ человека обойти иерархию и не даёт ни одному сотруднику новых прав.
   - Инициатор — единственный системный актор «магазин от имени владельца» (учётная запись `accountType = SYSTEM`: без входа, ролей и сессий; создаётся владельцем при включении, а не сидом на production; без неё UNBAN и UNMUTE не исполняются). Действует как делегат владельца (пункт 1 ADR-0173: суперпользователь снимает всегда), ограниченный пп. 6-7.
   - Единственная точка входа — `DeliveryService` при выдаче позиции типа `UNBAN` или `UNMUTE` в заказе `COMPLETED`; HTTP-вызова «снять от имени магазина» нет; админская «повторить выдачу» перезапускает те же проверки, а не обходит их.
   - Запись обязательна и неотделима от действия: причина снятия в игре содержит номер заказа (переменная `{orderNumber}`, ADR-0184 п. 7), аудит `AuditLog` (`action = punishment.paid_removal`, `actorId` системного актора, `targetId` — наказание, в `changes` — `orderNumber`, `orderItemId`, версия правила, вид наказания). Без номера заказа команда не формируется. В админке видна запись «снято системой от имени владельца, заказ № ...»; публично выдавший не показывается (Q31, Q63).
   - Одно снятие на позицию заказа (идемпотентность по `orderItemId`, ADR-0184); повторный вебхук не снимает дважды; для UNBAN и UNMUTE количество больше 1 запрещено.
   - Возврат после выдачи не предусмотрен (ADR-0184 п. 8); снятое не восстанавливается.
   - Отзыв исключения: выключение товара или `punishments.paidRemoval.enabled = false` без деплоя; выключение не откатывает уже снятое.
   - Механизм снятия в LiteBans (команда `unban`/`unmute` через `CommandTransport` либо подтверждённое действие Bridge) задаётся шаблоном и транспортом (ADR-0184); сайт в БД LiteBans не пишет (ADR-0178), зеркало обновится синхронизацией.
10. **Что не меняется.** Q31 (IP и контакты нигде не публичны), ADR-0173 для людей, throttler (ADR-0177), модерация чата (ADR-0171).

**Изменено по ревью Q&S 2026-11-18.** Правки ниже обязательны; исходные пункты выше не удалены, при расхождении действует этот раздел. Статус остаётся Proposed. Пп. 1-8 ревью внесены как Р1-Р8, п. 9 — как Р9 с пометкой о непринятии.

Р1. **Лимиты по `rateLimitKey` (уточняет п. 2).** Все новые лимиты ADR-0186 (30 отказов в час, пороги Turnstile, лимит страницы заказа и новые) считаются по `rateLimitKey(ip)` (ADR-0163, ADR-0177: IPv6 агрегируется в `/64`), а не по сырому `req.ip`. Тест: ротация адреса внутри одной `/64` не даёт нового ведра счётчика; адреса из разных `/64` не делят ведро. Было: «по `req.ip`» для 10/мин и «30 отказов в час на IP».

Р2. **Блокировка чужого ника и неоплаченные заказы (уточняет п. 2).** Лимит «10 запросов в час на один ник» заменяется лимитом по ОТКАЗАМ `nick_unavailable`: чужой ник нельзя заблокировать для оплаты потоком обращений, успешное оформление и оплата не блокируются счётчиком отказов. Для неоплаченных (`PENDING`) гостевых заказов вводятся срок жизни (по умолчанию 24 часа, затем отмена) и потолок числа одновременно неоплаченных заказов на ник и на клиента (по умолчанию 3); значения — настройки. Было: «10 запросов в час на один ник (по хешу ника)».

Р3. **Тайм-оракул (уточняет п. 2).** Ответы на «нет такого ника» и «ник недоступен для этого товара» неотличимы по коду, форме и телу и выровнены по времени (минимальная фиксированная длительность ответа либо ограниченный по размеру и сроку кэш результата, чтобы быстрый путь не выдавал отказ). Тест: одинаковые тело и код для двух случаев; разброс времени ниже порога, заданного в тесте.

Р4. **Гостевой токен не в пути URL (заменяет доставку токена в пп. 3-4).** Токен в пути `/store/orders/guest/:token` попадает в логи nginx и Cloudflare, историю браузера и Referer. Новая схема: ссылка страницы заказа несёт токен во ФРАГМЕНТЕ (`/orders/guest#t=...`; фрагмент на сервер не отправляется); страница отправляет токен POST-запросом обмена (`POST /store/orders/guest/exchange`, в теле, не в URL) и получает HttpOnly, Secure, SameSite=Lax куку сессии гостевого заказа (отдельный секрет, в БД только хеш); обмен ОДНОРАЗОВЫЙ: после обмена токен из ссылки недействителен. Статус читается по куке; путь исключается из логов; `Referrer-Policy: no-referrer` и `Cache-Control: no-store` сохраняются. Ответ гостю не содержит `paymentId`, `paymentUrl`, внутренних id и сырых полей провайдера (замечание N1 ревью S1): только статус заказа и выдачи, названия позиций, ник. Допущение: потеря куки или смена устройства лечится обращением в поддержку по номеру заказа; вынесено в отчёт. Было: токен в пути `GET /store/orders/guest/:token` (п. 4 выше).

Р5. **`QUICK_BUY_ENABLED` (уточняет пп. 1 и 5).** Существующий анонимный `POST /store/quick-buy` принимает любой ник (длина 1-16) и открыт сейчас. Вводится флаг `QUICK_BUY_ENABLED` (по умолчанию `false`, fail-closed): пока он не включён, существующий путь отвечает 503 `quick_buy_unavailable` без создания заказа. Закрытие делается отдельным срезом ДО 0.12 (не ждёт `NickResolver`). Для переключения без деплоя вводится также настройка БД `quickBuy.enabled` (по умолчанию `false`); quick-buy работает, только если разрешают обе. Включение возможно лишь при подключённом источнике ников (п. 1) и закрытых Р1-Р4.

Р6. **Уникальные и личные товары для гостя по нику (дополняет п. 5).** Консервативное поведение: товары с `isSelfOnly = true` или `isUnique = true` в quick-buy НЕ продаются (покупка только после входа). Причина: проверка «уже куплено» по нику раскрывала бы историю покупок чужого ника (ещё один оракул), а «только для себя» нельзя проверить без аккаунта. Такие товары отвергаются кодом `login_required` без раскрытия причины и истории. Допущение вынесено в отчёт.

Р7. **Сроки и очистка.** Просроченные неоплаченные заказы и использованные токены обмена очищаются: до решения владельца о расписании срок проверяется при чтении, фоновая очистка по расписанию не запускается (ограничение проекта).

Р8. **Связь с ADR-0184.** Номер заказа `{orderNumber}`, снимок ника, заморозка шаблона и повторная проверка ника (ADR-0184 Р3, Р9) действуют и здесь.

Р9. **Платное снятие: п. 9 НЕ ПРИНИМАЕТСЯ без решения владельца (Q79).** Исключение к ADR-0173 (Q48/Q49) в п. 9 выше остаётся предложением; принять его может только владелец. Переработка условий (дополняет пп. 6-9; исходный текст п. 9 не удалён):
   - Техническое условие шаблона: шаблон с командой снятия (`unban`, `pardon`, `unmute` и т.п.; список команд снятия в конфигурации) допустим ТОЛЬКО у вариантов товаров типа `UNBAN` или `UNMUTE`. Проверка при сохранении шаблона (иначе 422); смена типа товара, у которого есть такой шаблон, на другой тип блокируется; привязка такого шаблона к варианту другого типа отвергается.
   - Привязка позиции: при оформлении позиция заказа фиксирует `punishmentId` и `uuid` ника на момент оформления. При выдаче проверяется тот же `uuid` и то же активное наказание (тот же `punishmentId`, всё ещё активно и подпадает под правила п. 7); при несовпадении задание получает `NEEDS_ATTENTION` с причиной `not_applicable`, команда не отправляется. Снять другое наказание того же ника или наказание ника с другим `uuid` нельзя.
   - Аудит `punishment.paid_removal` с номером заказа записывается ДО отправки команды, в той же транзакции, что и переход задания в `IN_PROGRESS`; если запись аудита не удалась, задание не стартует. Было: аудит «неотделим от действия» без указания порядка (п. 9 выше).

**Требования к реализации (подэтап 0.12).**
- Закрыть существующий quick-buy флагом `QUICK_BUY_ENABLED=false` первым срезом; тест 503 без создания заказа.
- Лимиты по `rateLimitKey`; тест ротации адреса внутри `/64`; лимит по отказам, а не по запросам; тест: успешная оплата не блокируется отказами; срок жизни и потолок неоплаченных заказов.
- Тест одинакового тела и кода для «нет ника» и «недоступен»; тест выравнивания времени.
- Гостевой токен: фрагмент, POST-обмен на куку, одноразовость; путь исключён из логов; тест формы ответа без `paymentId` и внутренних полей.
- Тест: `isSelfOnly` и `isUnique` не продаются гостю.
- UNBAN и UNMUTE (только после решения владельца по Q79): тест запрета шаблона снятия у вариантов других типов; тест привязки `punishmentId` и `uuid`; тест порядка «аудит до команды в одной транзакции с IN_PROGRESS».

**Consequences.** Покупка по нику возможна без аккаунта, но платой остаётся оракул существования ника: удержать его полностью нельзя, можно только удорожить (R145). Для проверки в production нужен хотя бы один включённый источник ников (R146); до этого quick-buy выключен. Платное снятие по умолчанию отключено пустыми правилами и неактивными товарами, пока владелец не пришлёт список; исключение сформулировано узко, чтобы не читаться как «владелец-бот снимает что угодно» (R147). Токен гостевого заказа — ссылка-ключ: утечка раскрывает статус одного заказа и ник, но не деньги и не аккаунт (R149). Миграции (`guestAccessTokenHash`, `known_players`, а также `delivery_tasks` из ADR-0184) — expand-only, на production применяет владелец. Юридические вопросы (платное снятие наказаний, самозанятость, оферта, ПДн) — «требует решения владельца».

## ADR-0187 — Платёжный слой 0.8a: расширенный PaymentProvider, адаптер mock-http, fail-closed, ротация секрета

**Status:** Proposed (backend, 2026-11-18). Номер выбран как следующий после ADR-0186 (ADR-0184–0186 лежат в других ветках; при слиянии проверить отсутствие дублей номера). Конкретный провайдер, боевые ключи и production — у владельца (промпт 12).

**Context.** План `docs/plan/PRIORITY-PLAN-DRAFT.md`, 0.8: нужен общий интерфейс платёжного провайдера, мок и песочница без внешней сети; возврат подключается к заказам только в 0.9.

**Decision.**
1. **Интерфейс.** К `createPayment` и разбору вебхука добавлены `getPaymentStatus(paymentId)` и `refund({ paymentId, amountMinor?, idempotencyKey })`: сумма не задана = полный возврат, задана = частичный (не больше остатка). Результат возврата — `refundId`, статус, сумма. `OrdersService.refund` к интерфейсу НЕ подключён (0.9).
   **Изменено по ревью 2026-11-18** (формулировка выше — исходная, приведена к коду): сигнатура `refund(paymentId: string, amount: Prisma.Decimal, idempotencyKey: string)`; `amount` — всегда явная сумма в десятичных рублях (`Decimal`, 2 знака), единицы minor (`amountMinor`) не используются. Режима «без суммы» нет: полный возврат = передача полной суммы платежа (остатка); частичный — любая сумма > 0 и не больше остатка. `idempotencyKey` — 1..128 символов; адаптер `mock-http` дополнительно требует формат `[A-Za-z0-9._:-]`. `getPaymentStatus(paymentId)` возвращает `{ paymentId, status, amount, currency, refundedAmount }`, суммы — `Decimal` в рублях. Результат возврата — `{ refundId, paymentId, status, amount, currency }`.
2. **Ошибки.** Единый `PaymentProviderError` с кодом: `unavailable`, `timeout` (повторяемые), `rejected`, `not_found`, `refund_not_allowed`, `invalid_response`, `not_configured`. Сообщения без секретов, URL с ключами, тел запросов и ПДн.
3. **Идемпотентность.** `idempotencyKey` обязателен для возврата (не пустой, до 128 символов); повтор с тем же ключом возвращает прежний результат и не создаёт второй возврат (`payment-ledger`); ключ передаётся провайдеру заголовком.
4. **Таймауты и ретраи.** `PAYMENT_HTTP_TIMEOUT_MS` (по умолчанию 5000), `PAYMENT_HTTP_RETRIES` (0–5, по умолчанию 2), `PAYMENT_HTTP_RETRY_DELAY_MS` (по умолчанию 200). Повторяются только `unavailable`/`timeout` (сеть, таймаут, 5xx, 429); 4xx не повторяется. Лимит ретраев провайдера отдельный и не связан с лимитом `quick-buy` 10/мин (Q13) и с лимитами пользовательских запросов; риск R29 (шторм повторов при сбое провайдера) ограничен малым верхним пределом.
5. **Fail-closed.** `PAYMENT_PROVIDER` пуст или не заданы нужные секреты/ключи = провайдер не регистрируется, создание платежа отвечает 503 `payment_unavailable`, вебхук отклоняется. В production (`isProductionLike`, пустой `NODE_ENV` = production) провайдеры `test` и `mock-http` не регистрируются вообще; `mock-http` только `development`/`test` и только на локальный адрес мока.
6. **FAILED -> COMPLETED.** Поздний `succeeded` по заказу в `FAILED` (проверки провайдера, суммы, валюты, paymentId те же) возвращает заказ в обработку и в `COMPLETED` по обычному пути выдачи; в `CANCELLED` — только запись и предупреждение для ручного разбора. Повтор вебхука идемпотентен.
   **Изменено по ревью 2026-11-18** (исходная формулировка выше сохранена): в `CANCELLED` заказ не восстанавливается; пишется лог и отправляется уведомление приоритета HIGH (в обход пользовательских настроек) персоналу с правом `orders.view` и суперпользователям (до 50 получателей); решение о возврате принимает человек.
7. **Секрет вебхука и ротация.** Минимальная длина 32 символа (Joi и код; короче отбрасывается). Два секрета: `PAYMENT_WEBHOOK_SECRET` (текущий) и `PAYMENT_WEBHOOK_SECRET_PREVIOUS` (предыдущий, на период ротации); подпись принимается по любому из них, сравнение в постоянное время. Порядок ротации: добавить новый как текущий, старый в PREVIOUS, после перехода провайдера очистить PREVIOUS. Значения задаёт только владелец.

**Consequences.** Адаптер реального провайдера реализует тот же интерфейс без изменений в заказах. Мок-HTTP нельзя включить в production. Данные: схема БД не менялась, миграций нет. Хранилище идемпотентности возвратов в 0.8a — в памяти процесса (`payment-ledger`); устойчивое хранение — задача 0.9 (R: повтор возврата после рестарта процесса не дедуплицируется локально, защищает идемпотентность на стороне провайдера).


## ADR-0188 — Возвраты и сверка платежей (0.9)

**Status:** Proposed (backend, 2026-11-22). Номер — следующий после ADR-0187; при слиянии проверить отсутствие дублей. Конкретный провайдер, боевые ключи и production — у владельца; работа идёт на `TestPaymentProvider` и mock-http (0.8a).

**Context.** План v1.1, 0.9; Q83, Q85, Q87; п. 4.1 решений владельца (возврат на исходный способ и только непотраченный остаток). До 0.9 `PATCH /admin/orders/:id/refund` лишь менял статус, деньги не возвращались.

**Decision.**
1. **Флаг.** `STORE_REFUNDS_ENABLED` (по умолчанию false). Выкл.: `admin/store/refunds/*` отвечает 503 `refunds_disabled`, фоновая сверка не работает, старый `PATCH :id/refund` остаётся учётной отметкой. Вкл.: старый путь отвечает 409 `refund_use_refunds_api`, деньги возвращает только новый API.
2. **API.** `GET /admin/store/refunds` (список, фильтры status, orderId), `POST /admin/store/refunds/orders/:orderId` (возврат), `POST /admin/store/refunds/orders/:orderId/override` (возврат по ошибке после выдачи). Права: `orders.refund`; override — `orders.refund` И `store.refund.override` (новое право; в ролях по умолчанию его нет, суперпользователь/владелец проходит через общий механизм прав). Тело: `reason` (обязательна, 1–1000), `twoFactorCode`, `amount?` (десятичная строка до 2 знаков; без неё — весь остаток).
3. **Свежая 2FA.** Отдельного «step-up» в проекте нет; используется `TwoFactorService.verify(userId, code, { allowBackup: false })`: только TOTP, шаг одноразовый (повтор того же кода отклоняется). Код передаётся в теле каждого возврата. `TwoFactorService` зарегистрирован в `StoreModule` собственным экземпляром (AuthModule его не экспортирует; модуль Auth не менялся).
4. **Поток.** Транзакция 1 (блокировка заказа FOR UPDATE, проверки, строка `order_refunds` PENDING с ключом `refund:{orderId}:{n}`, заказ -> `REFUND_PENDING`, строгий аудит) -> вызов `PaymentProvider.refund` ВНЕ транзакции -> транзакция 2 (итог). Итоги: `succeeded` -> `REFUNDED` (полный) или обратно `COMPLETED` (частичный; остаток растёт); отказ провайдера (`rejected`, `refund_not_allowed`, `not_found`, `failed`) -> `REFUND_FAILED`; неизвестный исход (`unavailable`, `timeout`, `pending`) -> остаётся `REFUND_PENDING`, разрешается сверкой. Повтор после `REFUND_FAILED` с той же суммой и видом использует ТОТ ЖЕ ключ идемпотентности (защита от двойного возврата, если «отказ» на деле дошёл до провайдера). Двойной запрос: `REFUND_PENDING` -> 409 `refund_in_progress`, `REFUNDED` -> 409 `order_already_refunded`. Сумма не больше остатка (`total` минус успешные возвраты).
5. **Итог от провайдера идемпотентен.** `RefundsService.applyOutcome` (ответ, сверка, будущий вебхук возврата 0.8b): повтор не меняет; `succeeded` после `failed` принимается (деньги ушли), `failed` после `succeeded` игнорируется. Общий `PaymentWebhookEvent` не расширялся (события возврата в интерфейсе провайдера нет) — вебхук возврата подключит адаптер 0.8b через `applyOutcome`.
6. **До/после выдачи (Q85).** Обычный возврат: 409 `refund_after_delivery`, если есть задания DELIVERED/MANUAL_DONE либо `OrderItem.isDelivered` (старые заказы без заданий); IN_PROGRESS и др. — 409 от слоя выдачи (`delivery_in_progress`). При полном возврате невыданные задания отменяются (`cancelOpenTasks`). Пока заказ `REFUND_PENDING`/`REFUND_FAILED`, выдача не идёт (слой выдачи работает только для COMPLETED).
7. **Override («возврат по ошибке»).** Только если товар выдан (иначе 409 `refund_override_not_needed`); свежая 2FA, причина, право, критичный аудит `orders.refund.override_requested/_completed`. При полном возврате: сайтовая выдача отзывается (`revokeSiteGrants`), игровые выдачи автоматически не отзываются (ADR-0184 п. 8) — `order_refunds.requiresManualRevoke = true` и запись в аудите: нужен ручной отзыв.
8. **Рубины.** Кошелька рубинов в оформлении заказа нет (`Wallet` — только агрегат, платёж рубинами не реализован), поэтому заказ с `paymentMethod = ruby` возврату не подлежит: 422 `refund_rubies_unsupported`. Допущение: при появлении платежа рубинами возврат — только непотраченный остаток на тот же кошелёк (п. 4.1).
9. **Сверка.** Таймер процесса (5 мин, в тестах выкл.), только при включённом флаге. PENDING и FAILED («ложный FAILED») заказы с `paymentId`, старше `STORE_REFUNDS_RECONCILE_MIN_AGE_MINUTES` (15) и не старше `STORE_REFUNDS_RECONCILE_WINDOW_HOURS` (72), партия `STORE_REFUNDS_RECONCILE_BATCH` (50), не чаще порога на заказ (`orders.paymentReconciledAt`): `getPaymentStatus` -> тот же путь, что у вебхука (`OrdersService.handleWebhook`: суммы, валюта, идемпотентность, задания выдачи). `refunded` или частичный возврат у провайдера мимо сайта — заказ не завершается, предупреждение для ручного разбора. REFUND_PENDING сверяется по `refundedAmount`. Логи — только id заказов и коды.
10. **Данные.** Миграция `20261122100000_store_refunds` — expand-only: два значения `OrderStatus` (`REFUND_PENDING`, `REFUND_FAILED`), enum `OrderRefundStatus`, таблица `order_refunds` (FK RESTRICT, записи не удаляются), колонка `orders.paymentReconciledAt`, индексы. Не применялась (Q28); на production — владелец после ревью. Новые значения enum не использовать в той же транзакции миграции.

**Допущения.** Полный возврат по умолчанию, частичный поддержан (интерфейс принимает сумму). Идемпотентность на стороне сайта — по строке `order_refunds` и блокировке заказа; на стороне провайдера — по ключу. Политика «после выдачи — только override» зашита в код (в плане — «в настройках»; настройку добавим по решению владельца). Снятие бана/мута за деньги не затрагивается.

**Consequences.** Метрики и алерты PENDING/FAILED — только подготовка (лог сверки, статусы в БД); дашборд — отдельно. Риски: R-новый — зависание `REFUND_PENDING` при недоступном провайдере (сверка раз в 5 мин, ручной разбор); enum `OrderStatus` расширен — потребители с исчерпывающим switch (web/shared) проверить; e2e `store-refunds.e2e-spec.ts` не запускалась.

**Дополнение к ADR-0188 по ревью Security (2026-11-22; исходный текст выше сохранён).**
11. **Частичный возврат и выдача.** Частичный возврат не отзывает выдачу и не отменяет открытые задания: заказ остаётся `COMPLETED`. Отзыв (`cancelOpenTasks`, для override ещё `revokeSiteGrants`) выполняется только при полном возврате (сумма успешных возвратов >= `total`).
12. **Срок REFUND_PENDING.** Нет ответа провайдера дольше `STORE_REFUNDS_PENDING_TIMEOUT_HOURS` (по умолчанию 72, 1–720) от последнего обновления попытки: сверка проверяет `getPaymentStatus`, и если возврат не отражён, переводит попытку в FAILED (`errorCode = provider_timeout`), заказ в `REFUND_FAILED`, аудит `orders.refund.failed`. Допущение: если провайдер позже всё же вернул деньги, `applyOutcome(succeeded)` после `failed` принимается; повтор возврата идёт прежним ключом идемпотентности, второго возврата у провайдера не будет.
13. **Ручной выход.** `POST /admin/store/refunds/orders/:orderId/mark-failed` (право `orders.refund`, свежая TOTP-2FA, причина): `REFUND_PENDING` -> `REFUND_FAILED` (`manual_failed`), критичный аудит `orders.refund.marked_failed` на администратора. Дальше возможен обычный повтор. Нет возврата в ожидании — 409 `refund_not_pending`.
14. **Перебор 2FA.** Для `create`/`override`/`mark-failed`: `@Throttle` 10/мин (по IP) и счётчик неверных кодов в Redis по `actorId` (5 за 15 мин, затем 429 `refund_two_factor_locked`; верный код сбрасывает). Redis недоступен — запрос не проходит (fail closed).
15. **Аудит сверки.** Заказ не завершён на сайте, но у провайдера есть возврат: один раз на заказ `orders.order.external_refund_detected` (warning, актор — системный аккаунт; нет аккаунта — только лог). Расхождение суммы ответа провайдера и попытки: возврат остаётся `REFUND_PENDING`, аудит `orders.refund.amount_mismatch` (critical).
16. **Статусы в клиентах.** `REFUND_PENDING`/`REFUND_FAILED` добавлены в `ORDER_STATUSES` (shared), подписи на web («Возврат обрабатывается», «Возврат не удался»), неизвестный статус показывается нейтрально и не роняет страницу. Миграций нет.

## ADR-0189 — Каталог слоя 0, настройки и шаблоны игровых команд (0.11); ограниченное снятие hard gate 05–06

**Status:** Proposed (backend, 2026-11-23). Номер следующий после ADR-0188; при слиянии проверить отсутствие дублей. Дополняет ADR-0185 (там зафиксировано ограниченное снятие gate 05–06 и неактивность новых товаров); здесь это подтверждается для 0.11 и добавляются шаблоны команд и тексты.

**Context.** План v1.1, 0.11. В 0.7 исполнитель `command` отправляет только `renderedCommand` из задания, а шаблонов нет (`Product.gameCommands` не читается, ADR-0184 Р1). Нужно, чтобы владелец задавал команды выдачи без деплоя и без возможности инъекции.

**Decision.**
1. **Границы снятия gate 05–06 (подтверждено).** Разрешены только продажа и выдача группы или товара командой на игровой сервер. Запрещены: шансы x2/x3, перки, которых нет в игре, донат-бонусы в азартных механиках, Level System. Конкретный платёжный провайдер, боевые ключи и production остаются у владельца.
2. **Хранение.** Таблица `delivery_command_templates` (миграция `20261123100000_delivery_command_templates`, expand-only, без внешних ключей): `productId`, `variantId?`, `scopeKey` UNIQUE (`productId:variantId` или `productId:*`), `template` (до 200), `version` (растёт при каждом изменении), `updatedBy`. Шаблон варианта приоритетнее шаблона товара. Записи не удаляются; отключение выдачи командой — флагами.
3. **Валидатор** (`modules/delivery/command-template.ts`). Переменные только `{username}` и `{duration}`; любая другая или одиночная скобка отклоняется. Литерал — белый список: латиница, цифры, пробел и `_ - . : , +`; всё остальное (`;`, `&&`, `|`, `$(`, обратные кавычки, кавычки, скобки, `/`, переводы строк, управляющие и не-ASCII символы) отклоняется. `{username}` обязателен, шаблон не начинается с `/`, длина до 200, каждая переменная не более 4 раз, итог не более 256 (колонка `renderedCommand`). Ник подставляется только через `isDeliverableNick` (`^[A-Za-z0-9_]{3,16}$`, без зарезервированных), срок — только из перечня `ProductDuration`. Итог повторно проверяется по белому списку.
3a. **Срок в команде (допущение).** FOREVER -> `forever`, MONTHS_3 -> `90d`, MONTH_1 -> `30d`, WEEK_1 -> `7d`, SEASON -> `season`, ONE_TIME -> `once`. Слова срока — forever, 90d, 30d, 7d, season, once; сверка с плагином прав за владельцем, правка — одна таблица в коде.
3b. **Белый список корней команд (допущение).** Первое слово шаблона (без учёта регистра) должно быть из набора по умолчанию: `lp`, `luckperms`, `give`, `crate`, `cratekey`, `eco`. Набор расширяется настройкой `store.delivery.extra_command_roots` (`site_settings`, через запятую) ТОЛЬКО через `GET`/`PUT /admin/store/delivery-templates/roots` по праву `store.delivery.templates.manage` со свежей 2FA и аудитом `store.delivery.roots.updated`. Явный запрет сильнее расширения: `op`, `deop`, `stop`, `restart`, `reload`, `whitelist`, `ban`, `ban-ip`, `pardon`, `kick`, `execute`, `sudo`, `console`, `plugman`, `plugins`, `gamemode`, `fill`, `rcon`, `save-*` и др. (список в `FORBIDDEN_COMMAND_ROOTS`); запрещённый корень отклоняется и при сохранении расширения. Битая настройка при выдаче трактуется как «без расширения». Следствие: команды вроде `unban`/`unmute` требуют, чтобы владелец добавил корень в расширение (или заменил на команду плагина прав).
3c. **Порядок проверок записи.** Шаблон (формат и корень) -> существование товара и варианта -> TOTP-2FA; код не сгорает из-за опечатки в id. Счётчик неверных кодов — один Lua-скрипт INCR+EXPIRE (`INCR_EXPIRE_SCRIPT`), без гонки между INCR и EXPIRE.
4. **API.** `GET /admin/store/delivery-templates`, `POST /admin/store/delivery-templates/preview` (итоговая команда без отправки и без записи), `PUT /admin/store/delivery-templates/products/:productId` (тело: `template`, `variantId?`, `twoFactorCode`). Право `store.delivery.templates.manage` (новое; в ролях по умолчанию его нет, владелец проходит через общий механизм прав). Запись: свежая TOTP-2FA через `TwoFactorService.verify(..., { allowBackup: false })`, `@Throttle` 10/мин и счётчик неверных кодов в Redis (5 за 15 минут, затем 429; Redis недоступен — отказ). Аудит `store.delivery.template.updated` (critical) в той же транзакции со старым и новым значением; сбой аудита откатывает изменение.
5. **Выдача.** `DeliveryService.createTasksForOrder` рендерит команду при создании задания и замораживает в `renderedCommand` и `templateVersion` ТОЛЬКО если включены и `STORE_DELIVERY_ENABLED`/настройка доставки, и исполнитель `command`; иначе поведение 0.7 (manual) не меняется. Сбой подстановки (например, негодный ник) — задание остаётся ручным, предупреждение в логе. Исполнитель по-прежнему отправляет только `renderedCommand` и повторно проверяет ник.
6. **Тексты.** В `site_settings` по белому списку ключей `store.text.*` (правила снятия бана и мута, политика возвратов, описания перков, вступление магазина, уведомление в оформлении), только простой текст до 2000–8000 символов без управляющих символов. `GET /store/texts` публичный; `GET`/`PUT /admin/store/settings` по новому праву `store.settings.manage`; аудит `store.settings.updated` (старое/новое) в транзакции. Правила снятия наказаний пока пусты, их присылает владелец.
7. **Товары неактивны по умолчанию.** Подтверждено: `ProductsService.create` всегда пишет `isActive = false`, поля в DTO нет (ADR-0185 п. 6).
8. **Env.** `STORE_REFUNDS_PENDING_TIMEOUT_HOURS` добавлен в валидацию (целое 1–720, по умолчанию 72); код 0.9 его уже читал.

**Допущения.** Одна команда на товар или вариант (несколько шагов выдачи — позже). Каталог из 0.11 (7 привилегий, 3 ключа, Размут, Разбан, Рубины, Боевой пропуск) вносится через существующую админку товаров, не сидом; это действие владельца и администратора.

**Consequences.** Риск: неверный шаблон даёт неверную команду на сервер, поэтому есть preview и 2FA; риск: срок-токены не совпадают с плагином прав. Откат: revert PR; шаблоны остаются в БД и не используются без флагов.

**Дополнение к ADR-0189 по ревью Security (2026-11-23; исходный текст выше сохранён).**
9. **«Только владелец» — процедурный контроль.** Право `store.delivery.templates.manage` выдаётся только роли владельца; по умолчанию его нет ни у одной роли. Технического запрета «кроме владельца» нет: защита — выдача права, свежая TOTP-2FA и аудит.
10. **Защищённые ключи общих настроек.** `PUT /admin/settings` (право `settings.edit`) отвечает 403 `settings_key_protected` только на ключи со специальными эндпоинтами: точный ключ `store.delivery.extra_command_roots` (2FA и аудит «было/стало») и префикс `store.text.` (право `store.settings.manage` и аудит). Остальные `store.delivery.*` (`enabled`, `maxAttempts` и т. п., настройки выдачи 0.7) пишутся общим PUT как до 0.11. Запрос с защищённым ключом отклоняется целиком, ничего не записывается.
11. **Счётчик неверных 2FA атомарен.** Для шаблонов INCR+EXPIRE (Lua) выполняется ДО `verify`; шестая и следующие попытки в окне 15 минут — 429 без проверки кода; верный код сбрасывает счётчик. Параллельные запросы не обходят лимит гонкой «прочитал-проверил-увеличил».
12. **Экранирование текстов магазина.** `store.text.*` — простой текст; экранирование при выводе (без `dangerouslySetInnerHTML`, без интерпретации разметки) — обязательное требование к потребителю (web, лаунчер, мобильные клиенты).

## ADR-0190 — Quick-buy по нику и платное снятие наказаний: реализация 0.12 и исключение к Q48/Q49

**Status:** Accepted для реализации частей, не затрагивающих ADR-0173 (0.12a и подготовка 0.12b); **исключение к Q48/Q49 (платное снятие бана и мута «от имени владельца») — Proposed до решения владельца (Q79)**: код исключения заведён, но по умолчанию закрыт тремя независимыми замками (ниже). Backend Lead, 2026-11-23. Реализует ADR-0186 (пп. 1-9, Р1-Р9); при расхождении ADR-0186 приоритетнее, кроме явно указанных отклонений.

**Context.** До 0.12 уже были: `POST /store/quick-buy` (лимит 10/мин, Q13), `QUICK_BUY_ENABLED` (fail closed), проверка ника в `NickResolver` по `MinecraftAccount`, единый отказ `nick_unavailable`, акцепт оферты. Не было: способа увидеть гостевой заказ (номер заказа подбираем и требует входа), товаров UNBAN/UNMUTE с правилами, записи снятия.

**Decision.**
1. **Источник существования ника (0.12a).** Остаётся цепочка без внешних вызовов: привязанные Minecraft-аккаунты сайта (`MinecraftAccount.name`, регистр не важен). Имена зеркала наказаний (`MinecraftPunishment.subjectName`), Bridge `player.join` и Mojang — следующие источники в том же `NickResolver` (0.13 / решение владельца об online-mode, Q88); отдельной ручки «проверить ник» нет (ADR-0186 п. 2, вариант B). Ответ на неизвестный ник, на «нет подходящего наказания» и на исчерпанный лимит снятия один: `nick_unavailable`.
2. **Гостевой токен.** `Order.guestAccessTokenHash` (SHA-256 hex, UNIQUE) и `guestAccessExpiresAt` (30 дней). Токен: 32 байта CSPRNG (256 бит), base64url, возвращается один раз в ответе оформления (`guestAccessToken`), в БД и логах только хеш; не хранятся IP, user-agent, адрес. `POST /store/orders/guest/lookup` с токеном в ТЕЛЕ (не в URL, ADR-0186 Р4), лимит 60/мин, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; ответ — белый список (`toGuestOrderView`: номер, статус, ник, суммы, названия позиций, статус выдачи), без id, userId, платёжных полей, `paymentUrl`. Неизвестный, просроченный и токен заказа пользователя дают один 404. `GET /store/orders/:orderNumber` по-прежнему требует входа и отдаёт 404 на чужой и гостевой заказ.
   **Отклонение от Р4:** обмен токена на HttpOnly-куку и одноразовость не реализованы в этом срезе (токен многоразовый до истечения); ссылку со фрагментом `#t=` формирует web. Причина: нужен отдельный секрет куки и хранилище сессий; риск низкий (128+ бит, не в URL, срок 30 дней). Вернуться в отдельном срезе, если владелец потребует.
3. **Ограничения гостя (Р6).** Товары `isSelfOnly`, `isUnique` и тип `CURRENCY` в quick-buy — 403 `login_required` (после проверки лимитов корзины, чтобы коды лимитов не менялись).
4. **Правила платного снятия (0.12b)** — настройка `punishments.paidRemoval` (JSON в `site_settings`), разбор `paid-removal-rules.ts`: `enabled`, `unbanEnabled`, `unmuteEnabled`, `allowedReasons`, `deniedReasons`, `maxPerNick`, `periodDays`, `minAgeHours`, `actorUserId`, `version`. Любая ошибка разбора, нет настройки или пустой `allowedReasons` — снятие недоступно. Список нарушений и лимиты пришлёт владелец; по умолчанию пусто.
5. **Три замка (fail closed).** (а) env `UNPUNISH_ENABLED` (в production по умолчанию false, как `QUICK_BUY_ENABLED`); (б) настройка правил с непустым списком причин и включённым видом; (в) товар UNBAN/UNMUTE активен (`isActive`, по умолчанию товары создаются неактивными администратором). Закрыт любой замок — оформление отвечает 503 `paid_removal_unavailable` (код не зависит от ника, оракула нет). Количество больше 1 — `paid_removal_single_only`. Оформление дополнительно требует активное подходящее наказание ника в зеркале (бан или мут, не IP-бан, выдавший известен, причина по правилам, возраст, лимит на ник за период); иначе `nick_unavailable`.
6. **Запись снятия.** Таблица `paid_removal_records` (UNIQUE `orderItemId`: одно снятие на позицию; всегда есть `orderNumber`, вид, ник, `punishmentId`, версия правил) и аудит `punishment.paid_removal` (strict, в той же транзакции, актор — системная учётная запись `accountType = SYSTEM` из `actorUserId`, `changes.summary` = «Снято системой от имени владельца, заказ № …», без IP). Единственная точка — `PaidRemovalService.recordRemoval(orderItemId)`; HTTP-вызова нет. Повтор (повторный вебхук, повтор выдачи, гонка) возвращает `created = false`, вызывающий не отправляет команду повторно. Наказание в момент выдачи неприменимо — `PaidRemovalNotApplicableError` (задание -> `NEEDS_ATTENTION`, `not_applicable`). Нет системного актора — `paid_removal_actor_missing`, записи нет.
7. **Что не меняется.** ADR-0173 для людей (админка, массовое снятие, обращения), Q31 (IP и контакты нигде не публичны), сайт в БД LiteBans не пишет, возврат после выдачи не предусмотрен (ADR-0184 п. 8).

8. **Лимит и цель внутри транзакции записи (ревью Security, MEDIUM).** `recordRemoval` в транзакции берёт `pg_advisory_xact_lock` по нику (в нижнем регистре), затем перепроверяет лимит `maxPerNick` за период и отсутствие записи по тому же `punishmentId`; нарушение — `PaidRemovalNotApplicableError`, запись и аудит не создаются. Два параллельных заказа на один ник или одно наказание не обходят лимит и не снимают наказание дважды. Уникального индекса по `punishmentId` нет намеренно: после повторного наказания тот же ник получает новую строку зеркала с новым id, а отдельная expand-only миграция не нужна при сериализации блокировкой.
9. **Исполнитель снятия не подключён: fail closed на оформлении (MEDIUM).** Выдача (`delivery.service.ts`) отправляет UNBAN/UNMUTE в manual и не вызывает `recordRemoval`. Константа `PAID_REMOVAL_EXECUTOR_WIRED = false` (метод `isExecutorWired()`) закрывает оформление товаров снятия: 503 `paid_removal_unavailable` даже при `UNPUNISH_ENABLED=true` и верных правилах, чтобы игрок не платил за снятие, которое не будет выполнено. Это четвёртый замок к трём из п. 5. Тест фиксирует значение false; константа переключается на true тем же изменением, которое подключает снятие к исполнителю.
10. **Возврат при неприменимом снятии (политика 0.9, ADR-0188).** Если к моменту выдачи снятие неприменимо (наказание снято или истекло, лимит исчерпан гонкой, нет системного актора), задание получает `NEEDS_ATTENTION` с причиной `not_applicable`, команда не отправляется. Деньги за непредоставленную услугу возвращаются только через возврат 0.9 (`POST /admin/store/refunds/orders/:orderId`, свежая 2FA, на исходный способ, непотраченный остаток); автоматического возврата нет. Заказ в этом состоянии остаётся COMPLETED до решения администратора; срок реакции и обязательность возврата утверждает владелец (Q79).
11. **Единообразие отказов гостя (LOW).** Неверный формат токена на `/store/orders/guest/lookup` даёт тот же 404, что и неизвестный (DTO формат не проверяет, только тип и длину до 512); ветка `nick_unavailable` всегда выполняет и поиск наказания, и подсчёт лимита (без раннего выхода), чтобы время ответа не различало причины. Лимит 60/мин зафиксирован тестом метаданных контроллера.
12. **Очистка просроченных гостевых токенов (отложено).** Токен недействителен после `guestAccessExpiresAt` (30 дней), но запись в заказе остаётся: хеш SHA-256 256-битного секрета не раскрывает токен, а заказ — журнал денег и не удаляется (правило «ничего не удалять»). План: периодическое задание обнуляет `guestAccessTokenHash` и `guestAccessExpiresAt` у заказов с истекшим сроком (`UPDATE`, не удаление), пачками по 500. Индекс по `guestAccessExpiresAt` для такого задания — отдельная expand-only миграция (`CREATE INDEX CONCURRENTLY`-совместимая, без блокировки записи), отложена: при текущем объёме гостевых заказов полный просмотр дешёв, индекс нужен, когда заказов станет порядка сотен тысяч; пока задание не написано, просроченные токены безвредны (поиск проверяет срок).

**Зависимости.** `recordRemoval` вызывается исполнителем выдачи ПЕРЕД отправкой команды `unban`/`unmute`; сам вызов и привязка `punishmentId`/`uuid` к позиции зависят от шаблонов команд 0.11 (ADR-0189) и исполнителя 0.13 и в 0.12 не подключены: до тех пор UNBAN/UNMUTE выдаются на `manual`, а снятие в игре делает человек. `PaidRemovalService` экспортирован из `StoreModule`.

**Миграция.** `20261123110000_quickbuy_guest_token_paid_removal`, expand-only (две nullable-колонки, UNIQUE-индекс, новая таблица). Откат: код не использует колонки при revert PR; данные остаются.

**Откат.** `QUICK_BUY_ENABLED=false`, `UNPUNISH_ENABLED=false` или `punishments.paidRemoval.enabled=false`; товары UNBAN/UNMUTE деактивировать; revert PR.

**Допущения (без вопросов владельцу).** Лимит отказов `nick_unavailable` по `rateLimitKey` (Р1), Turnstile при переборе, выравнивание времени ответа (Р3) и потолок PENDING-заказов на ник (Р2) в 0.12 не реализованы: общий лимит 10/мин на IP действует, остальное — отдельный срез после выбора счётчика (Redis) и источников ников. Неизвестный выдавший наказания — не снимается; «наказание владельца» отличить нельзя без списка суперпользователей зеркала, поэтому защита — список разрешённых причин. `contactEmail` по-прежнему не сохраняется.

## ADR-0191 — Журнал кошелька рубинов (0.15); заменяет ADR-0094 в части хранения баланса

**Status:** Proposed (backend, 2026-11-23). ADR-0094 не изменён (остаётся как история); ADR-0190 в этой ветке отсутствует (ветка от более раннего `main`), при слиянии проверить отсутствие дублей номера. Ограниченное снятие gate 05-06 (ADR-0185/0189): только продажа и выдача рубинов как товара, без шансов, перков и азартных механик; передача рубинов между игроками не реализуется.

**Context.** План v1.1, 0.15. Баланс `wallets.balance` ADR-0094 был только читаемым агрегатом; нужны зачисление покупки, ручная корректировка, возврат и аудит без возможности «потерять» рубины.

**Decision.**
1. **Журнал.** Таблица `wallet_ledger_entries` (миграция `20261124100000_wallet_ledger`, expand-only: новый enum `WalletEntryKind`, одна таблица, индексы, триггер запрета UPDATE/DELETE; существующее не меняется, без DROP, без внешних ключей). `amount` BIGINT со знаком (не 0), `balanceAfter` >= 0 (CHECK), `idempotencyKey` UNIQUE. Баланс = сумма журнала; `wallets.balance` - материализация, меняется только в `WalletLedgerService.post` в той же транзакции.
2. **Запись.** `post` внутри транзакции: повтор по ключу (с проверкой совпадения пользователя, суммы и вида, иначе `wallet_idempotency_conflict`) -> та же проводка без изменения баланса; иначе INSERT строки кошелька `ON CONFLICT DO NOTHING`, `SELECT ... FOR UPDATE`, повторная проверка повтора под блокировкой, сверка суммы журнала с балансом (расхождение -> `wallet_inconsistent`, запись отказана), итог < 0 -> `wallet_insufficient`.
3. **Флаг** `WALLET_LEDGER_ENABLED` (по умолчанию false). Выкл.: `GET /wallet/history` и админ-API -> 503 `wallet_disabled`; `GET /wallet` (балансы ADR-0094) работает как раньше; задания CURRENCY создаются как `manual` с причиной `wallet_disabled`; исполнитель не зачисляет.
4. **Исполнитель `wallet`.** Товар типа CURRENCY с получателем-пользователем: 1 рубль = 1 рубин, количество = `quantity` позиции, проводка `PURCHASE`, ключ `purchase:<orderItemId>:<step>`; повтор задания или вебхука не зачисляет второй раз. Нет получателя -> `failed: recipient_not_registered`.
5. **API.** `GET /wallet` (без изменений), `GET /wallet/history?page&limit` (только свой), `GET /admin/wallet/users/:userId` (право `wallet.view`, баланс из журнала, признак `consistent`, история с данными выдавшего), `POST /admin/wallet/users/:userId/adjust` (право `wallet.adjust`; тело `amount`, `reason`, `twoFactorCode`, `requestId?`). Корректировка: причина обязательна, потолок `WALLET_ADJUST_MAX` (по умолчанию 100000, по модулю), свежая TOTP-2FA без резервных кодов, счётчик неверных (Lua INCR+EXPIRE, 5 за 15 минут, затем 429), `@Throttle` 10/мин, не в минус, аудит `wallet.adjusted` (critical) в той же транзакции, идемпотентность по `requestId`. Порядок: формат -> пользователь -> 2FA.
6. **Права.** `wallet.view`, `wallet.adjust` добавлены в `packages/shared`; по умолчанию ни у одной роли (выдаёт владелец).
7. **Возврат (0.9).** В транзакции возврата (под блокировкой заказа) списывается только непотраченный остаток рубинов по заказу проводкой `REFUND_REVERSAL`: весь остаток при возврате всей оставшейся суммы, иначе пропорционально (вверх), не больше остатка. Не хватает баланса -> 409 `refund_rubies_spent` до обращения к провайдеру (деньги не уходят). Флаг выкл., а рубины по заказу есть -> 503 `wallet_disabled`. Возврат FAILED -> `REFUND_RESTORE` (идемпотентно); поздний успех после FAILED -> списание заново, при неудаче аудит `orders.refund.rubies_unreversed` и ручной разбор.
8. **422 `refund_rubies_unsupported`** (заказ оплачен рубинами) сохранён без изменений: оплаты рубинами в оформлении заказа нет. Снимается только отдельным срезом при включённом `WALLET_LEDGER_ENABLED`; сейчас не снимается.

**Доработка по ревью Security (2026-11-23).** (а) Исполнитель `wallet` в той же транзакции блокирует заказ (`FOR UPDATE`) раньше кошелька и не зачисляет, если заказ не COMPLETED/REFUND_FAILED, в возврате или есть PENDING-возврат (`failed`: `order_not_paid`, `order_refund_in_progress`); уже проведённая позиция повторяется как замена без отказа; `reverseRubies` тоже сначала блокирует заказ, затем кошелёк (единый порядок заказ -> кошелёк против взаимоблокировки). (б) Корректировка собственного кошелька - 403 `wallet_self_adjust_forbidden`; суточный лимит суммы модулей на актёра `WALLET_ADJUST_DAILY_MAX` (по умолчанию 500000, advisory-lock на актёра, 400 `wallet_adjust_daily_limit`). (в) Миграция `20261124110000_wallet_ledger_hardening` (отдельная, expand-only): триггер BEFORE TRUNCATE и значение `OPENING_BALANCE`. Рекомендация: роль приложения без UPDATE/DELETE/TRUNCATE/TRIGGER на журнал (runbook). (г) Бэкфилл: вид `OPENING_BALANCE` (ключ `opening-balance:<userId>`) сводит прежние балансы с журналом; служебный скрипт `prisma/scripts/wallet-opening-balance.ts` только для владельца, отчёт и `--apply`; при запуске с включённым флагом расхождения пишутся в лог. Порядок - `docs/runbooks/wallet-ledger.md`. (д) Исполнитель сверяет цену позиции (unitPrice = 1, totalPrice = quantity), иначе `unknown: currency_price_mismatch` (NEEDS_ATTENTION). Пункт «бэкфилл не делается» в допущениях ниже заменён этим пунктом (г).

**Допущения.** Курс 1:1 без дробей; рубины зачисляются на `Order.userId`-получателя из задания; общий потолок баланса не вводится; бэкфилл прежних балансов не делается (у `wallets` данных нет, сверка не пройдёт, если строка есть без журнала - это осознанный отказ `wallet_inconsistent`).

**Consequences.** Риск: ручные правки `wallets.balance` в обход журнала блокируют записи кошелька до разбора. Миграцию применяет только владелец после ревью. Откат: флаг выкл. (журнал остаётся, не удаляется).

## ADR-0192 — Поиск игроков по нику: `GET /users/search` (план 1.4, Q73)

**Решение.** Публичный поиск по нику для страницы `/players`. Параметры: `q` (после обрезки пробелов 2–32 символа), `limit` 1–20 (по умолчанию 20), `page` 1–50. Ответ `{ items: [{ username, tag, avatar }], page, limit, hasMore }` — только поля `PUBLIC_USER_SELECT` без `id` (ADR-0107); email, IP, роли, настройки приватности и статусы не отдаются.

**Кого показывать.** Только `profileVisibility = EVERYONE`, `isBanned = false`, `accountType != SYSTEM`. Профили «только друзьям» и «никто» не выдаются никому, включая вошедших друзей: поиск анонимный и не зависит от зрителя, чтобы выдача не раскрывала существование закрытых профилей и не требовала проверок связей на каждую строку. Скрытие по блокировке между игроками не нужно по той же причине (профили открыты всем).

**Поиск.** Prisma `contains` с `mode: insensitive` (`ILIKE`; `\`, `%` и `_` экранируются в сервисе функцией `escapeLike` — Prisma их не экранирует, исправлено в #222); внутри страницы префиксные совпадения идут раньше вхождений, общий порядок по нику. Индекс не добавлялся: ник уникален и короткий (до 16), выборка ограничена `take = limit + 1`; триграммный индекс (`pg_trgm`) — отдельная expand-only миграция, когда пользователей станет порядка сотен тысяч. Миграций в этом срезе нет.

**Лимит частоты.** `@Throttle` 30 запросов в минуту на IP; модуль сайта `profiles` (503 при выключении). Маршрут `users/search` имеет один сегмент и не пересекается с `users/:username/...`.

**Web.** `/players` (поле с debounce 350 мс, запрос от 2 символов, состояния пусто/ошибка/429, `aria-live`), иконка поиска в шапке основного сайта (в режиме GIVEAWAY_ONLY не показывается). Меню профиля: пункт «Безопасность и сессии» (`/settings/security`); «Избранное» и «Заказы» больше не скрываются при выключенном модуле магазина (план 1.4, раздел 8) — страницы сами показывают недоступность.

**Откат.** Revert PR. **Не сделано:** витрина и статистика по приватности — API уже есть (`/users/:username/showcase`, `summary`), в 1.4 не менялись.

## ADR-0193 — Маршрутизатор способов оплаты на моках (план 0.8b, промпт 21)

**Решение.** Игрок выбирает способ оплаты; `PaymentRouter` направляет платёж провайдеру через общий интерфейс `PaymentProvider` (ADR-0157 — подпись вебхуков). Способы: `SBP`, `CARD_RU`, `SBERPAY`; `CARD_FOREIGN` и `CRYPTO` выключены по умолчанию.

**Конфигурация.** `PAYMENT_METHODS=<способ>:<провайдер>,…` включает способ и задаёт провайдера. Способ доступен, только если провайдер есть в реестре, `isConfigured()` и `supportedMethods` содержит способ. Пустое значение — способов нет (fail closed); при пустом списке действует прежний путь `PAYMENT_PROVIDER`.

**Моки.** `mock-ru` (SBP, CARD_RU, SBERPAY), `mock-crypto` (CRYPTO), `mock-foreign` (CARD_FOREIGN): без сети, детерминированный `paymentId`, состояние в памяти процесса; регистрируются только при `NODE_ENV` = development или test. Пустой или незаданный `NODE_ENV` = production (Q1–Q13): реестр без моков, Joi допускает `PAYMENT_METHODS` и `PAYMENT_PROVIDER` только пустыми, пока владелец не назовёт провайдера и не даст ключи.

**Данные.** Способ и провайдер хранятся в существующих `Order.paymentMethod` и `Order.paymentProvider` — миграции нет. Вебхук (`/webhooks/payments/:provider`), возврат и сверка идут по провайдеру заказа; вебхук чужого провайдера отклоняется (`provider_mismatch`).

**API.** `GET /store/payment-methods` → `{ methods: [{ code, title, currency }] }` (без имени провайдера). `CreateOrderDto` и `QuickBuyDto`: необязательное `paymentMethod`; ошибки 400 `payment_method_required`, `payment_method_invalid`, `payment_method_unavailable` до записи в БД; 503 `payment_unavailable`, если способов нет. Лимит quick-buy 10/мин сохранён.

**Идемпотентность.** Создание платежа (детерминированный `paymentId`), повтор вебхука (переход статуса `updateMany where status`), возврат (ключ; повтор ключа с другой суммой отвергается).

**Не сделано.** Реальные адаптеры (ЮKassa, Robokassa, крипто, агрегатор) — после выбора провайдера владельцем и тестовых ключей; тогда же: проверка при старте, что провайдеры из `PAYMENT_METHODS` есть в реестре (ревью L4), обязательный `router` в `OrdersService` (L3), e2e возврата через `RefundsService` и сверки для новых провайдеров (L1), запись в журнал платежа только после сверки заказа (L2). Пакет документов для модерации у провайдера (оферта, возвраты, описание товаров, контакты) — черновики для владельца отдельным срезом. Web: выбор способа на оформлении — отдельный срез.

**Откат.** Revert PR; пустой `PAYMENT_METHODS` возвращает прежнее поведение.

## ADR-0194 — Исполнитель выдачи `bridge`: очередь заданий и подтверждение сервера (план 0.13, срез 1)

**Статус.** Допущение агента, требует подтверждения владельцем. Связь: ADR-0184 (исполнители выдачи), ADR-0182 (приёмник Bridge), ADR-0189 (белый список команд), Q28, Q42. PR #228.

**Решение.** Pull-модель: исполнитель `bridge` кладёт готовую команду (только прошедшую `validateRenderedCommand`: корни `lp`, `luckperms`, `give`, `crate`, `cratekey`, `eco` и расширение из настроек; без `/`, управляющих символов и неподставленных переменных) в таблицу `bridge_delivery_jobs`. Плагин забирает задания `POST /bridge/v1/delivery/claim` (max 1–10, `FOR UPDATE SKIP LOCKED`, только задания своего `serverSlug` из подписанного key-id, одноразовый `claimToken`) и подтверждает `POST /bridge/v1/delivery/ack` (1–20 результатов `done|failed|retry|unknown`, `code` `^[a-z0-9_]{1,48}$`, CAS по `claimToken`; чужое и несуществующее задание неразличимы — `unknown_job`). Аутентификация — существующая подпись Bridge (HMAC/HKDF, nonce, окно времени, лимиты); новых секретов нет. Команда проверяется при постановке, в исполнителе и повторно при выдаче плагину.

**Исходы.** `done` → DELIVERED; `failed` → FAILED (`bridge_<code>`); `retry` (команда точно не выполнялась) → повтор; `unknown` или нет ack за 10 с при захваченном задании → UNKNOWN без автоповтора (повтор только явным действием админа); не захваченное к дедлайну — атомарная отмена и `retry`. Поздний ack применяется только к той же попытке.

**Fail closed.** Работает только при `BRIDGE_ENABLED`, мастер-секрете, `BRIDGE_DELIVERY_ENABLED=true` (по умолчанию false), настройках `store.delivery.executor.bridge.enabled` и `store.delivery.bridge.serverSlug`, `capabilities.delivery` у сервера. Иначе 503/403, заказы остаются на `command`/`manual`; дефолтный исполнитель товаров не меняется.

**Условие включения в production (ревью M2).** До `BRIDGE_DELIVERY_ENABLED=true` и `delivery: true` у сервера должен быть развёрнут плагин (срез 2) с персистентным хранилищем выполненных ключей идемпотентности (`orderItemId:step`): админский повтор после UNKNOWN переиспользует ключ, и защита от двойной выдачи держится на плагине. В админке повтора — предупреждение о возможной двойной выдаче (срез 2).

**Миграция.** `20261124120000_bridge_delivery_jobs` — новый enum и таблица (expand-only, Q28), FK на `delivery_tasks` с каскадом; на production применяет владелец. Нужен PostgreSQL 13+ (`gen_random_uuid()`).

**Не сделано (срез 2).** Java-плагин по `docs/stage-03/BRIDGE-CONTRACT.md` раздел 14; e2e полного цикла claim/ack на реальных строках (ревью M1); админский повтор и просмотр UNKNOWN; retention очереди (L2); метрики просроченных CLAIMED/UNKNOWN; константное сравнение токена (L1).

**Откат.** Флаг выключен по умолчанию; Revert PR (таблица остаётся до решения владельца).

## ADR-0195 — Публичная статистика игроков и рейтинги с кэшем (план 0.14, срез 1)

**Решение.** Профиль и `GET /leaderboards` показывают только данные, уже лежащие в БД: `PlayerStatistics` (время в игре, убийства, смерти, K/D, монеты — то, что присылает игровой сервер) и достижения (`UserAchievement`). «Покупки» скрыты до запуска оплаты (Q66); расширение контракта Bridge — только по решению владельца (Q68). Раздел включается настройкой `stats.public.enabled` (`'true'`; по умолчанию выключен — пустые списки и «Скоро»).

**Приватность.** В рейтинг попадают только `profileVisibility = EVERYONE`, без `hideStatistics`, не забаненные, не системные; закрытый профиль отдаёт `{ username, hidden: true }`; IP, контакты и данные выдавшего не отдаются (Q31).

**Кэш.** В памяти процесса, TTL 30 с, single-flight с поколением, сброс при смене `profileVisibility` и `hideStatistics`. Допущение (Q109): бан и разбан кэш не сбрасывают — забаненный может оставаться в рейтинге до 30 с; при нескольких инстансах API данные расходятся до 30 с. Лимит `GET /leaderboards` 60/мин.

**Миграций нет.** **Откат.** Revert PR или выключить настройку.

## ADR-0196 — Обжалование наказаний с игровых серверов (LiteBans) со статусом (план 1.2, Q103)

**Решение.** Обжалование наказания из зеркала LiteBans — обращение существующей модели `reports` типа `PUNISHMENT_APPEAL` с новой ссылкой `reports.appealedMinecraftPunishmentId` (FK на `minecraft_punishments`, `ON DELETE SET NULL`). PR #235.

**API.** `POST /reports` принимает `appealedPunishmentRef` (`^(ban|mute)-[1-9][0-9]{0,17}$`, только для `PUNISHMENT_APPEAL`, ровно одно из `appealedPunishmentId`/`appealedPunishmentRef`). Ошибки: 400 (форма; `punishment_not_appealable`), 403 `minecraft_not_linked` (нет привязки или офлайн-uuid), 404 (чужое, несуществующее, удалённое в источнике — неразличимы), 409 `appeal_already_open`, 429 `appeal_cooldown` (24 ч на повтор по тому же наказанию), общий лимит 5 обращений за 10 мин. `GET /punishments/me` добавляет `appealable` и `appeals[]` (`reportNumber`, `status`, даты, `verdict` ≤ 1000 символов). Связанное наказание в обращении — белый список полей без исполнителя, причины, uuid и IP (Q31); `subjectName` — только персоналу. Аудит `reports.appeal.create`.

**Принадлежность.** Наказание сверяется с uuid привязанного аккаунта автора; строка зеркала блокируется (`FOR UPDATE`); одно открытое обжалование — проверка в сервисе и частичный уникальный индекс `reports_open_mc_appeal_uniq` (PENDING/IN_REVIEW/WAITING_RESPONSE). CHECK `reports_one_appealed_punishment` — не более одной ссылки на наказание.

**Границы.** Решение по обжалованию никогда не меняет запись в LiteBans или зеркале (снятие — отдельное действие персонала на сервере / Bridge по отдельному решению).

**Миграция.** `20261124130000_report_appealed_mc_punishment` — expand-only (Q28); CHECK и частичный индекс Prisma не выражает: при `prisma migrate dev` их НЕЛЬЗЯ удалять (дрейф ожидаемый). На production применяет владелец.

**Долг (ревью).** Переоткрытие закрытого обращения при уже открытом другом по тому же наказанию упадёт на уникальном индексе — нужен перехват P2002 → 409 в `reports-moderation.service.ts`; интерфейс связи с наказанием для персонала в админке; учёт cooldown в `appealable`/`nextAppealAt`; рекомендация модераторам не писать в `verdict` IP и внутренние заметки.
