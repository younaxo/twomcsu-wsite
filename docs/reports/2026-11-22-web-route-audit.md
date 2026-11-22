# Аудит маршрутов основного сайта (2026-11-22)

Дерево `twomcsu-wsite-wt/web`, ветка `feature/web-night-1`. Только чтение кода; сборки и e2e не запускались. Статусы выставлены по наличию страницы, обращению к API и контроллеру (`apps/api/src/modules/**`), а не по живому прогону. Розыгрыш (`/giveaway`) не рассматривался.

Источники ссылок: `lib/site/config.ts` (SITE_NAVIGATION - шапка, мобильная навигация, rail; FOOTER_*), `components/shell/*` (mini-profile, floating-actions, notifications-popover, sidebar-rail, server-status-button), `lib/admin/navigation.ts` + `app/admin/_components/*`.

## Таблица ссылок

| Ссылка | Источник | Маршрут | Статус | API | Что доделать |
|---|---|---|---|---|---|
| `/` | логотип, моб. навигация | `(site)/page.tsx` | работает на реальном API | `site/*` | - |
| `/shop` | шапка, rail, моб., футер | `(site)/shop` + `[slug]` | работает (модуль `store`) | `store/catalog,categories,products` | - |
| `/shop#bonus` | rail (Бонусы) | якорь на `/shop` | работает (проверено 2026-11-22: `<section id="bonus">` в `shop/page.tsx`) | - | - |
| `/rules` | шапка, футер | `(site)/rules` + `[slug]` | работает | `topics` | - |
| `/servers` | шапка, rail, футер | `(site)/servers` | работает (SLP, модуль `minecraft`) | `servers/*` | сделано 2026-11-22: `/servers/[slug]` (карточка, статус, график, игроки), ссылки из списка |
| `/shop/cart` | поповер корзины | `(site)/shop/cart` | работает (Skeleton/Empty/Error есть) | `store/cart` | ссылка не битая, см. раздел 404 |
| `/shop/checkout` | поповер корзины | `(site)/shop/checkout` | работает | `store/checkout`, `checkout-config` | платёж только мок/песочница (hard gate) |
| `/login?next=/shop` | поповер корзины | `(auth)/login` | работает | `auth` | - |
| `/notifications` | поповер уведомлений | `(site)/notifications` | работает (модуль `notifications`) | `notifications` | - |
| `/status` | кнопка статуса | `(site)/status` | работает | `site`, `minecraft` | - |
| `/#quick-start` | футер | якорь на `/` | работает (проверено 2026-11-22: `HomeSection id="quick-start"`) | - | - |
| `/wiki` | футер (`available:false`) | нет | заглушка («Скоро», без ссылки) | - | отдельное решение владельца |
| `/news` | футер | `(site)/news` + `[slug]` | работает | `admin/news`, публичный список | - |
| `/vote` | футер | `(site)/vote` | работает (модуль `voting`) | `voting` | - |
| `/leaderboards` | футер | `(site)/leaderboards` | честное пустое состояние (данные из игры - Bridge) | `leaderboards` | наполнится после приёмника Bridge |
| `/bans` | футер | `(site)/bans` + `[ref]` | флаг выключен: `punishments.public.enabled` (SiteSetting, `PunishmentsPublicEnabledGuard`; при выключении API отдаёт 404 `punishments_public_disabled`) | `punishments/public` | включить флаг в админке после решения владельца; проверить UI при выключенном флаге |
| `/achievements` | футер | `(site)/achievements` + `[slug]` | работает (модуль `achievements`) | `achievements` | - |
| `/forms` | футер | `(site)/forms` + `[slug]`, `invite/[code]` | работает (модуль `forms`) | `forms` | - |
| `/legal/privacy,terms,cookies,info,refunds` | футер | `(site)/legal/[doc]` | работает | `topics` | юр. тексты вне scope |
| Политика Mojang | футер | внешний URL | работает (external-link-guard) | - | - |
| `/u/{username}` | профиль-меню | `(site)/u/[username]` | работает | `users/:username/public` | - |
| `/settings` | профиль-меню | `(site)/settings` + 8 вложенных | работает | `users/me/*`, `auth`, `punishments/me` | - |
| `/friends` | профиль-меню | `(site)/friends` | работает | `friends` | поиска игроков (`GET /users/search`) нет: проверено 2026-11-23, страница поиска не делалась (нет API) |
| `/messages` | профиль-меню | `(site)/messages` + `[id]`, `invite/[code]` | работает | `messages` | - |
| `/support` | профиль-меню | `(site)/support` + `[reportNumber]`, `new/[type]` | работает | `moderation/reports` | - |
| `/shop/orders` | профиль-меню (если store включён) | `(site)/shop/orders` + `[orderNumber]` | работает | `store/orders` | - |
| «Избранное» | профиль-меню | `(site)/shop/wishlist` | сделано 2026-11-22: страница + пункт меню (при включённом модуле store) | `store/wishlist` | - |
| `/admin` | профиль-меню (по праву входа) | `admin/page.tsx` | работает | `admin/*`, `site` | - |
| Админка: users, media-requests, roles(+`[id]`), permissions, positions, departments, custom-positions | `lib/admin/navigation.ts` | все есть | работает | `admin/users`, `admin/departments`, `admin/custom-positions`, `admin/media-requests` | - |
| Админка: punishments (подраздел «Пользователей») | navigation.ts | `admin/punishments` | сделано 2026-11-22: список, фильтры, выдавший скрыт по умолчанию (Q31) | `admin/punishments` | карточка и скрытие выдавшего (POST/DELETE issuer-hidden) - позже |
| Админка: content, news(+new,`[id]`), events, topics(+new,`[id]`), forms(+`new`, `[id]`, `[id]/edit`), voting, reports(+`[reportNumber]`) | navigation.ts | все есть | работает | `admin/news,events,topics,forms,voting/sites`, `moderation/reports` | конструктор форм сделан 2026-11-23 |
| Админка: moderation/comments, moderation/profiles (пункт «Жалобы на контент») | navigation.ts | есть | сделано 2026-11-23: очередь, фильтр статуса, принять/отклонить с заметкой, жёсткое удаление комментария с подтверждением | `admin/comment-reports`, `admin/profile-reports`, `moderation/comments/:id/hard-delete` | - |
| Админка: notifications | navigation.ts | `admin/notifications` | сделано 2026-11-23 | `admin/notifications/*` | - |
| Админка: server-categories | navigation.ts (подраздел «Серверов») | `admin/server-categories` | сделано 2026-11-23 | `admin/server-categories` | - |
| Админка: achievements, awards | navigation.ts | есть | работает | `admin/achievements` | - |
| Админка: store/products, categories, orders(+`[id]`), delivery(+`[id]`), promocodes, discounts | navigation.ts | есть | работает | `admin/store/*`, `admin/orders`, `admin/delivery/tasks`, `admin/promocodes` | - |
| Админка: finance | navigation.ts | `admin/finance` | проверено 2026-11-23: не пустая обёртка (обзор с графиком продаж, топ товаров, заказы с экспортом, возвраты; права `finance.*`) | `admin/store/stats`, `wallet` (контроллера finance нет) | - |
| Админка: chat, communications, announcements, appearance, servers, system, storage, settings, security, audit-log, exports, tools | navigation.ts, quick-actions, status-overview | все есть | работает | `admin/chat`, `admin/communications`, `admin/servers`, `admin/system`, `admin/system/storage`, `admin` | `tools`, `exports`, `audit-log` - сверить контроллеры точечно |
| `/admin/system?tab=maintenance` и `?tab=modules`, `/admin/announcements?new=1` | quick-actions, status-overview | `admin/system`, `admin/announcements` | работает | `admin/system` | проверено 2026-11-22: `system/page.tsx` читает `tab`, `announcements-panel` читает `new=1` |
| `/admin/broadcast` | нет ссылки | страница-редирект на `/admin/announcements` (ADR-0081) | не осиротевшая: проверено 2026-11-23, пункт «Объявления» уже в меню по праву, ключевое слово broadcast в палитре | - | отдельная ссылка не нужна; массовые уведомления - см. `/admin/notifications` |

Сводка (по строкам таблицы, группы считаются одной строкой): работает на реальном API - 26; честное пустое состояние - 1 (`/leaderboards`); заглушка или Скоро - 1 (`/wiki`); флаг выключен - 1 (`/bans`); бэкенд есть, страницы нет - 1 (избранное); требуют проверки - 4 (якоря `#bonus` и `#quick-start`, finance, query-параметры админки); осиротевшая страница - 1; 404 - 0.

## 404 и битые ссылки

- Прямых 404 из навигации нет: все `href` шапки, футера, rail, мобильной навигации, профиль-меню, поповеров и меню админки имеют `page.tsx`.
- `/shop/cart` в поповере корзины не битая: страница существует, есть состояния загрузки, пустоты и ошибки.
- Меню профиля: все 6 пунктов (профиль, настройки, друзья, сообщения, обращения, заказы) ведут на существующие страницы; «Избранное» скрыто (нет href); отдельного пункта «Безопасность и сессии» нет (доступно через `/settings/security`).
- `/wiki` - маршрута нет, в футере показан как «Скоро» без ссылки (не битая).
- `/bans` - маршрут есть, но при выключенном флаге API отвечает 404 `punishments_public_disabled`; нужно проверить, что UI показывает честное состояние.
- На сайте розыгрыша те же ссылки намеренно показываются «Скоро» (SHELL_SOON_HREFS).
- Страницы без ссылок: `/admin/broadcast`, `/design-lab`, `/offline`, `/auth/result`.

## Бэкенд есть, страницы нет

- ~~`store/wishlist`~~ - сделано 2026-11-22 (`/shop/wishlist`).
- `store/bundles`, `admin/store/bundles`, `admin/store/currencies` - админ-страниц нет.
- ~~`admin/punishments`~~ - сделано 2026-11-22 (`/admin/punishments`, список).
- `admin/streams`, `streams` - страниц нет.
- ~~`admin/notifications`~~ - сделано 2026-11-23 (`/admin/notifications`: рассылка с подтверждением, вебхуки с маской адреса, статистика).
- ~~`admin/server-categories`~~ - сделано 2026-11-23 (`/admin/server-categories`, подраздел «Серверов»).
- ~~очереди жалоб на комментарии и профили~~ - сделано 2026-11-23 (`/admin/moderation/comments`, `/admin/moderation/profiles`; контроллер `admin/comment-reports`, `admin/profile-reports`). `moderation/users/*` (mute/warn/kick/ban) - действия над пользователем, не очереди; отдельного UI нет.
- ~~`servers/:slug`~~ - сделано 2026-11-22 (`/servers/[slug]`).

## Предложение порядка доработок

1. Быстрые проверки (S): якоря и query-параметры админки - сделано 2026-11-22; состояние `/bans` при выключенном флаге - осталось.
2. `/servers/[slug]` с графиком - сделано 2026-11-22.
3. Страница избранного и пункт меню профиля - сделано 2026-11-22.
4. Админ-страница наказаний (`admin/punishments`) - список сделан 2026-11-22; осталось включение `punishments.public.enabled` по решению владельца.
5. Очереди жалоб на комментарии и профили - сделано 2026-11-23.
6. Админ-UI уведомлений и категорий серверов - сделано 2026-11-23.
7. Конструктор форм - сделано 2026-11-23 (`/admin/forms/new`, `/admin/forms/[id]/edit`: поля, типы, порядок, предпросмотр; у формы с ответами поля заблокированы, ADR-0152).
8. `/admin/broadcast` - редирект на объявления, оставлен; `finance` проверен - сделано 2026-11-23.
9. Поиск игроков (`GET /users/search`) - пропущено 2026-11-23: публичного API поиска нет (`GET /users` - админский список по праву `users.view`); нужен новый бэкенд.
10. Wiki и рейтинги из игры - после решения владельца и приёмника Bridge.

## Блок J: недостающие админ-страницы

Источник: `docs/reports/2026-11-17-J-inventory-07-10.md` (на 2026-11-17; частично устарел, админка магазина с тех пор появилась). Недостающее:

- ~~UI очередей жалоб на комментарии и профили~~ - сделано 2026-11-23.
- ~~UI админ-уведомлений (`admin/notifications`)~~ - сделано 2026-11-23.
- ~~Конструктор форм~~ - сделано 2026-11-23.
- Подписи «в разработке» у автомодерации.
- Рассылки в фоне (J-08-4) - нужна аддитивная миграция, только локальная БД.
- Найдено сверх J: админ-страница наказаний, bundles, currencies, streams, server-categories.
- Закрыто gate или зависимостью: украшения (этап 04), кастомные emoji (нет API).

## Допущения

- Статусы выведены из кода, без запуска; страницы со статусом «работает» не проверялись в браузере.
- Флаг `/bans` определён по ключу `punishments.public.enabled`; значение по умолчанию в БД не проверялось.
- Список блока J взят из инвентаризации 2026-11-17 без полной пересверки с текущим кодом.
