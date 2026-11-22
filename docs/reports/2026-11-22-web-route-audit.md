# Аудит маршрутов основного сайта (2026-11-22)

Дерево `twomcsu-wsite-wt/web`, ветка `feature/web-night-1`. Только чтение кода; сборки и e2e не запускались. Статусы выставлены по наличию страницы, обращению к API и контроллеру (`apps/api/src/modules/**`), а не по живому прогону. Розыгрыш (`/giveaway`) не рассматривался.

Источники ссылок: `lib/site/config.ts` (SITE_NAVIGATION - шапка, мобильная навигация, rail; FOOTER_*), `components/shell/*` (mini-profile, floating-actions, notifications-popover, sidebar-rail, server-status-button), `lib/admin/navigation.ts` + `app/admin/_components/*`.

## Таблица ссылок

| Ссылка | Источник | Маршрут | Статус | API | Что доделать |
|---|---|---|---|---|---|
| `/` | логотип, моб. навигация | `(site)/page.tsx` | работает на реальном API | `site/*` | - |
| `/shop` | шапка, rail, моб., футер | `(site)/shop` + `[slug]` | работает (модуль `store`) | `store/catalog,categories,products` | - |
| `/shop#bonus` | rail (Бонусы) | якорь на `/shop` | проверить | - | убедиться, что на `/shop` есть блок `#bonus` |
| `/rules` | шапка, футер | `(site)/rules` + `[slug]` | работает | `topics` | - |
| `/servers` | шапка, rail, футер | `(site)/servers` | работает (SLP, модуль `minecraft`) | `servers/*` | страницы `/servers/[slug]` нет |
| `/shop/cart` | поповер корзины | `(site)/shop/cart` | работает (Skeleton/Empty/Error есть) | `store/cart` | ссылка не битая, см. раздел 404 |
| `/shop/checkout` | поповер корзины | `(site)/shop/checkout` | работает | `store/checkout`, `checkout-config` | платёж только мок/песочница (hard gate) |
| `/login?next=/shop` | поповер корзины | `(auth)/login` | работает | `auth` | - |
| `/notifications` | поповер уведомлений | `(site)/notifications` | работает (модуль `notifications`) | `notifications` | - |
| `/status` | кнопка статуса | `(site)/status` | работает | `site`, `minecraft` | - |
| `/#quick-start` | футер | якорь на `/` | проверить | - | сверить id блока на главной |
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
| `/friends` | профиль-меню | `(site)/friends` | работает | `friends` | поиска игроков (`GET /users/search`) нет |
| `/messages` | профиль-меню | `(site)/messages` + `[id]`, `invite/[code]` | работает | `messages` | - |
| `/support` | профиль-меню | `(site)/support` + `[reportNumber]`, `new/[type]` | работает | `moderation/reports` | - |
| `/shop/orders` | профиль-меню (если store включён) | `(site)/shop/orders` + `[orderNumber]` | работает | `store/orders` | - |
| «Избранное» | профиль-меню | пункт скрыт (Q67) | бэкенд есть, страницы нет | `store/wishlist` | страница избранного + пункт меню |
| `/admin` | профиль-меню (по праву входа) | `admin/page.tsx` | работает | `admin/*`, `site` | - |
| Админка: users, media-requests, roles(+`[id]`), permissions, positions, departments, custom-positions | `lib/admin/navigation.ts` | все есть | работает | `admin/users`, `admin/departments`, `admin/custom-positions`, `admin/media-requests` | - |
| Админка: content, news(+new,`[id]`), events, topics(+new,`[id]`), forms(+`[id]`), voting, reports(+`[reportNumber]`) | navigation.ts | все есть | работает | `admin/news,events,topics,forms,voting/sites`, `moderation/reports` | конструктор форм - блок J |
| Админка: achievements, awards | navigation.ts | есть | работает | `admin/achievements` | - |
| Админка: store/products, categories, orders(+`[id]`), delivery(+`[id]`), promocodes, discounts | navigation.ts | есть | работает | `admin/store/*`, `admin/orders`, `admin/delivery/tasks`, `admin/promocodes` | - |
| Админка: finance | navigation.ts | `admin/finance` | проверить | `admin/store/stats`, `wallet` (контроллера finance нет) | проверить, что это не пустая обёртка |
| Админка: chat, communications, announcements, appearance, servers, system, storage, settings, security, audit-log, exports, tools | navigation.ts, quick-actions, status-overview | все есть | работает | `admin/chat`, `admin/communications`, `admin/servers`, `admin/system`, `admin/system/storage`, `admin` | `tools`, `exports`, `audit-log` - сверить контроллеры точечно |
| `/admin/system?tab=maintenance` и `?tab=modules`, `/admin/announcements?new=1` | quick-actions, status-overview | `admin/system`, `admin/announcements` | работает | `admin/system` | проверить, что страницы читают `tab` и `new` |
| `/admin/broadcast` | нет ссылки | страница есть | осиротевшая страница | - | включить в меню или решить судьбу |

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

- `store/wishlist` - страницы избранного нет.
- `store/bundles`, `admin/store/bundles`, `admin/store/currencies` - админ-страниц нет.
- `admin/punishments` - админ-страницы наказаний нет.
- `admin/streams`, `streams` - страниц нет.
- `admin/notifications` - админ-UI уведомлений нет.
- `admin/server-categories` - UI нет.
- `moderation/users`, `moderation/news/comments` - очереди жалоб без UI.
- `servers/:slug` (история и график) - страницы `/servers/[slug]` нет.

## Предложение порядка доработок

1. Быстрые проверки (S): якоря `#bonus` и `#quick-start`, query-параметры админки, состояние `/bans` при выключенном флаге.
2. `/servers/[slug]` с графиком - данные и API уже есть.
3. Страница избранного и пункт меню профиля - `store/wishlist` готов.
4. Админ-страница наказаний (`admin/punishments`) - контроллер есть; затем включение `punishments.public.enabled` по решению владельца.
5. Очереди жалоб на комментарии и профили (`moderation/*`) в админке.
6. Админ-UI уведомлений и категорий серверов.
7. Конструктор форм (редактор полей поверх `admin/forms`).
8. Решить судьбу `/admin/broadcast`, проверить `finance`.
9. Поиск игроков (`GET /users/search`) - нужен новый бэкенд, последним.
10. Wiki и рейтинги из игры - после решения владельца и приёмника Bridge.

## Блок J: недостающие админ-страницы

Источник: `docs/reports/2026-11-17-J-inventory-07-10.md` (на 2026-11-17; частично устарел, админка магазина с тех пор появилась). Недостающее:

- UI очередей жалоб на комментарии и профили (API есть).
- UI админ-уведомлений (`admin/notifications`).
- Конструктор форм: создание формы и редактор полей (API `admin/forms` есть).
- Подписи «в разработке» у автомодерации.
- Рассылки в фоне (J-08-4) - нужна аддитивная миграция, только локальная БД.
- Найдено сверх J: админ-страница наказаний, bundles, currencies, streams, server-categories.
- Закрыто gate или зависимостью: украшения (этап 04), кастомные emoji (нет API).

## Допущения

- Статусы выведены из кода, без запуска; страницы со статусом «работает» не проверялись в браузере.
- Флаг `/bans` определён по ключу `punishments.public.enabled`; значение по умолчанию в БД не проверялось.
- Список блока J взят из инвентаризации 2026-11-17 без полной пересверки с текущим кодом.
