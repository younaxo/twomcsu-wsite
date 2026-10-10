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
  + `original.png` (байт-в-байт). Без upscale (максимум — исходные 1920).
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
