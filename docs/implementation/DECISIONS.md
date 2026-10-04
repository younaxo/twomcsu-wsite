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
