# Аудит маршрутов основного сайта, часть 2 (2026-11-24)

Дополнение к `2026-11-22-web-route-audit.md` (не заменяет). Ветка `feature/web-l01-polish` от `origin/main`. Только чтение кода и vitest; `next build`, e2e и браузер не запускались.

## Метод

Скрипт (node, вне репозитория) собрал все `page.tsx` в `apps/web/src/app` (112 маршрутов, группы `(site)`/`(auth)` отброшены) и все строки-пути в `Link`/`href`/`router.push`/`redirect`/`ctaHref`/`link`, шаблонные `${...}` сведены к `[x]`. Каждый путь сверен с маршрутами.

## Результат

| Адрес | Было | Стало |
|---|---|---|
| `/admin/store` | 404 (есть только `/admin/store/*`) | redirect на `/admin/store/products` |
| `/admin/orders` | 404 | redirect на `/admin/store/orders` |
| `/admin/promocodes` | 404 | redirect на `/admin/store/promocodes` |
| `/wiki` (футер, `available:false`) | «Скоро» без ссылки, `aria-disabled` только в режиме shell | «Скоро» везде через `SoonItem`: без href, `aria-disabled="true"`, `cursor-not-allowed`, sr-only «Скоро» |
| `/bans` при выключенном флаге | ссылка в футере уже «Скоро» (Q74) | без изменений; UI страницы - компоненты `punishment-ui.tsx` (правки сделаны) |
| остальные ссылки меню, футера, rail, мобильной навигации, профиля, админ-навигации | существуют | без изменений; закреплено тестами |

Статических битых ссылок в навигации нет: все `href` `SITE_NAVIGATION`, `FOOTER_*`, `ADMIN_NAV` имеют `page.tsx` (тесты `nav-links.test.ts`, `admin-redirects.test.ts`). Пути вида `/store/...`, `/users/...` в коде - адреса API, не страницы. Редиректы пока не добавлены в меню и палитру (нужны только против 404 при ручном вводе).

## Изменения

- `components/shell/soon-item.tsx`: единый компонент «Скоро»; применён в шапке, футере, sidebar-rail, mobile-nav; `SiteNavItem.available?: boolean` в `lib/site/config.ts`.
- Цели касания 40px на мобильном: `ui/button.tsx` (sm, icon-sm), вкладки настроек, оболочка админки (`--control-h` 40px ниже `sm`).
- Состояния/мобильная раскладка: последние покупки, гостевой заказ, мои заказы, наказания.
- Админка магазина: аудит состояний (DataGrid: skeleton/empty/ErrorState с «Повторить»; QueryBoundary), `DataGrid` на мобильном - карточки, меню - Sheet ниже `lg`. Дыр не найдено.

## Не охвачено (честно)

- Пустые состояния/ошибки/мобильная раскладка `/shop`, товара, корзины, оформления, главной, `/u/[username]` - только grep на наличие ErrorState/EmptyState, детальной проверки не было.
- Реальная отрисовка 360-390px не проверялась (нет браузера).
- `ErrorState` может показать текст ошибки API (`components/ui`, вне области среза).
