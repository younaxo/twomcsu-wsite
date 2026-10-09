# PHASE 31 — Публичные страницы (частично): главная + оболочка v2

Статус: **в работе** (ветка `feature/home-shell-v2`). Первый срез — главная
страница целиком и доработка глобальной оболочки по ТЗ владельца.

## Главная (`app/(site)/page.tsx`, `_components/*`)

Порядок секций (все `section[id]`, якоря для CTA/футера):

1. `hero` — twomc.su, описание, онлайн/статус/IP/версии (реальный ping
   `GET /servers/overview`, версии — из ping/настроек серверов, без выдумки),
   «Начать играть» → быстрый старт, «Скопировать IP», медиа-слот: реальные
   скриншоты только через `NEXT_PUBLIC_HOME_HERO_IMAGES` (пути CDN через
   запятую); без них — официальный логотип с подписью «Скриншоты — скоро».
2. `showcase` — 1 крупная + 3 карточки (`HOME_FEATURES` в `lib/site/config.ts`:
   3D-казино, кинематографические ивенты, дуэли и сферы, талисманы и особые
   предметы); картинки — `NEXT_PUBLIC_HOME_FEATURE_*`, без них иконка.
3. `servers` — один сервер → одна большая карточка, иначе сетка; overview
   расширен полями `type/description/iconUrl/address/configuredVersion`.
4. `events` — «Сейчас на twomc.su»: активный, следующий (с обратным отсчётом,
   обновление раз в минуту), ближайшие; `GET /events/featured` + `GET /events`.
   Пусто — честный empty state.
5. `shop` — 3–5 позиций (`isFeatured` → `isPopular` → остальные) + «Перейти в
   магазин»; корзина — глобальная (store backend).
6. `news` — «Последнее на twomc.su», вкладки Новости / Обновления / Статьи по
   `NewsCategory`, 1 большая публикация + компактные (`GET /news/latest`).
   Страниц `/news/*` ещё нет — карточки без ссылок (не ведут в 404).
7. `quick-start` — 3 шага, «Скопировать IP», «Подробная инструкция» (скоро, с Wiki).
8. `community` — Telegram/Discord/TikTok из единого `resolveSocialLinks`; числа
   участников не показываются (реальных данных нет).
9. `cta` — адрес, онлайн, статус, «Начать играть» / «Как зайти?».

## Оболочка v2 (`components/shell/*`)

- **Header** — плавающая solid-поверхность внутри области контента: отступы
  сверху/слева/справа, `rounded-xl`, граница, тень, без backdrop-filter;
  sticky-обёртка прозрачная. Начинается после fixed rail.
- **Footer** — отдельный большой скруглённый контейнер (не full-bleed): бренд,
  описание, дисклеймер Mojang AB (ссылка `https://reallyworld.ru/mojang.pdf`,
  external, `rel="noopener noreferrer"`), соцсети, «Поддержка»
  (`support@twomc.su`, `admin@twomc.su`, Telegram `@twomcsu_support` — ссылка),
  «Игрокам», «Правовая информация» (+ «Политика Mojang AB»), язык/валюта, статус
  серверов, тема, юр. данные владельца, © год · версия (build sha в tooltip),
  `PaymentMethodLogos`.
- **Строка «New-Era Anarchy» удалена** из UI и metadata (`SITE_TAGLINE` → нет;
  `SITE_DESCRIPTION`).
- **Язык + валюта** — независимые настройки (`lib/site/preferences.ts`, zustand
  persist): ru/RUB доступны, en/USD/EUR показаны как «скоро» и не выбираются
  (ограничение в самом store). Показ `🇷🇺 Русский · ₽ RUB` в footer, флаг + код
  валюты в rail.
- **Chat/Cart** — edge-peek rail у правой границы (desktop): видна иконка
  (3 rem), по hover/focus/открытию кнопка выезжает (`translate-x`, 200 мс,
  без bounce). Корзина — только в `/shop*`, чат — `aria-disabled` «скоро».
  Mobile — dock над нижней навигацией. `z-floating` ниже modal/toast.
- **Payment SVG** — исходники владельца декодированы из data URI в
  `public/assets/payment/{visa,mastercard,mir,sbp}.svg`, SVGO
  (`removeViewBox`/`removeTitle` выключены), `<title>` для a11y.
- **Favicon/PWA** — из официального логотипа (1095×1094, вписан без искажений):
  `app/favicon.ico` (16/32/48), `app/icon.png`, `app/apple-icon.png` (тёмный фон
  бренда), `public/icons/{icon-192,icon-512,maskable-512}.png`, `app/manifest.ts`.
- **ColorPicker** — первопричина «не открывается»: класс `z-popover` был равен
  z-index модалки (50) и в запущенном dev-сервере отдавался устаревшим значением
  40 (Tailwind не перечитал конфиг) → панель рендерилась под overlay диалога.
  Шкала z-index изменена: `dropdown/popover = 55` (строго выше modal 50).
  Тест «внутри Dialog»: виден, в портале (без clipping), `z-popover`, Escape
  закрывает только picker.

## Юридический чек-лист перед production

- [x] Владелец подтвердил данные (2026-10-09): «Кирилл Алексеевич Баранов»,
      ИНН 230815487140, самозанятый (плательщик НПД). ОГРНИП/ИП/ООО не указываются.
- [ ] Тексты документов: конфиденциальность, соглашение, cookie, юр. информация,
      возвраты — пока «скоро» без fake-контента.
- [ ] Реальные скриншоты для hero/showcase (`NEXT_PUBLIC_HOME_*`).

## Проверки

lint/typecheck/format — чисто; web: 85 тестов (shell 11, ColorPicker 8,
главная 2); API e2e subset auth/users/news/events/roles; production build web.
Структурно проверено в браузере (1440): header `left=88 top=16 radius=20`,
footer `radius=20`, peek-кнопка видна на 48 px, `.z-popover { z-index: 55 }`,
favicon/manifest подключены, 4 SVG оплаты загружаются.

## Дальше в PHASE 31

Страницы новости/события/товара, профиль и настройки, Wiki, legal-документы,
принудительная смена пароля при `mustChangePassword`.

## Пакет 3: auth, Turnstile, внешние ссылки, бейдж вкладки, мобильная навигация

### Главная
- Порядок: hero → showcase → сервера → **недавно купили + магазин** → события →
  новости → как играть → сообщество → CTA → footer.
- «Недавно купили» (`_components/recent-purchases.tsx`) — горизонтальная лента над
  магазином из `GET /store/recent-purchases` (только COMPLETED-заказы). Ник
  маскируется на backend (`common/privacy.util.ts`, зеркало `maskNickname` из
  `@twomc/shared`: `younaxo_` → `yo***o_`), e-mail/id не отдаются. Лента
  прокручивается вручную, медленно едет сама (18 px/с) и останавливается при
  наведении/касании/фокусе; при `prefers-reduced-motion` автодвижения нет.
- «Как играть»: промокод **START** с кнопкой «Скопировать» (toast) и подсказкой,
  где применить. Награда не обещается — её задаёт backend (PromoCode).
- Версии Minecraft `1.21.4 — 1.21.11` — один раз, в hero (`SUPPORTED_VERSIONS`,
  env `NEXT_PUBLIC_MC_VERSIONS`).

### Оболочка
- Header — без рамки (глубина — поверхность + тень), отступы сохранены.
- Footer прижат к низу страницы: верхние углы скруглены (`rounded-t-xl`), снизу
  нет margin/padding-полосы; на короткой странице держится у низа viewport
  (колонка `min-h-dvh`, `main` — `flex-1`), в обычном потоке, не fixed/sticky.
- Соцсети в footer: Telegram, Discord, YouTube, TikTok, VK — официальные SVG
  (Simple Icons), одинаковая высота, tooltip, aria-label; без ссылки — слот
  недоступен (`resolveSocialSlots`). Telegram поддержки — с brand-иконкой.
- Язык/валюта: «Русский · RUB ₽», технический текст про независимые настройки удалён.
- Chat/Cart — обычные круглые плавающие кнопки (edge-peek отменён), счётчик 1…99+.
- Tooltip — без обводки (только поверхность, тень, радиус); focus-visible у
  триггеров не тронут.
- Sidebar — без border, фон `background-subtle` (почти как страница), активный
  пункт — оранжевая иконка на приподнятой подложке + маркер.
- Мобильная навигация — плавающая полукруглая solid-панель (отступы 12 px, safe
  area, без рамки/blur), 5 пунктов из общего конфига, активный — оранжевый,
  touch-target ≥ 48 px, компактный landscape-режим, прячется при открытой
  клавиатуре (visualViewport). Контент футера и плавающие кнопки учитывают её высоту.
- Сезонный декор (`SeasonalHeaderDecoration` + `lib/site/seasonal.ts`): Halloween
  с 1.10 по 7.11 по верхней кромке шапки; абсолютный, `pointer-events-none`,
  `aria-hidden`, CSS background (недоступный ассет не ломает страницу);
  `NEXT_PUBLIC_SEASONAL_DECORATION=off|<id>`, свой хостинг —
  `NEXT_PUBLIC_SEASONAL_HALLOWEEN_SRC`.

### Вкладка браузера
- Title — всегда `twomc.su` (шаблон metadata), с непрочитанными — `(N) twomc.su`,
  максимум `(99+)`.
- Favicon: `app/favicon.ico` (16/32/48 из официального логотипа), `icon.png`,
  `apple-icon.png`, PWA-манифест. **Баг артефакта**: runtime-ссылка бейджа имела
  `type="image/png"`, но в базовом состоянии указывала на `favicon.ico` — браузер
  брал её последней и рисовал мусор. Теперь ссылка всегда PNG: `/icon.png` или
  data:image/png с бейджем; держится последней в `<head>` и переприменяется после
  клиентской навигации; async-гонка закрыта счётчиком вызовов; кэш по значению.
- Стратегия unread (`lib/site/document-badge.ts`): единственный источник —
  `GET /notifications/unread-count` (TanStack `siteKeys.unread`); когда появится
  счётчик личных сообщений, он суммируется там же. Хук `useDocumentBadge`
  смонтирован в AppShell и AdminShell.

### Внешние ссылки
- `lib/site/external-links.ts`: `classifyLink`/`isTrustedUrl`, allowlist —
  `twomc.su` и поддомены (`cdn-files.twomc.su`…), localhost. mailto/tel/hash/
  внутренние — без модалки; `javascript:`/`data:`/битые URL блокируются.
- `ExternalLinkGuard` (в Providers): один capture-слушатель кликов, модалка
  «Вы переходите на внешний сайт» с hostname и компактным URL, «Отмена»/«Перейти»,
  открытие `window.open(..., 'noopener,noreferrer')`. Политика Mojang AB, соцсети,
  Telegram поддержки — через ту же систему.

### Auth (полностью переработан)
- Общая `AuthShell` (логотип, twomc.su, тема, solid-карточка), `PasswordField`
  (показ/скрытие), `describeAuthError` (сеть, 401/403/409/429, captcha).
- `/login` — Turnstile, состояния loading/error/rate-limit/captcha, ссылки
  «Забыли пароль?» и «Зарегистрироваться», уведомления `?registered=1`/`?reset=1`.
  «Запомнить устройство» не рисуется — backend не поддерживает.
- `/register` — поля по `RegisterDto` (e-mail, ник 3–16 `[a-zA-Z0-9_]`, пароль
  8–72 + подтверждение), Turnstile; реферального кода в контракте нет.
- `/forgot-password` — e-mail + Turnstile, нейтральный ответ.
- `/reset-password?token=` — проверка формы токена, новый пароль + подтверждение,
  Turnstile, состояния успеха/недействительной ссылки.

### Cloudflare Turnstile (ADR-0059)
- Backend `CaptchaService` → Siteverify (`TURNSTILE_SECRET_KEY`, таймаут 5 с,
  remoteip). Обязателен для login (каждая попытка), register, forgot-password,
  reset-password. Secret на frontend не попадает.
- Frontend `<Turnstile />` (`components/auth/turnstile.tsx`): explicit render,
  тема по «Полдню», reset после каждой попытки (токен одноразовый).
- Dev — официальные тестовые ключи Cloudflare (`.env.example`), CI e2e —
  `TURNSTILE_DISABLED=true` (без сети). hCaptcha удалена.
- `next.config.mjs` подхватывает `NEXT_PUBLIC_*` из корневого `.env` (раньше
  web их не видел вовсе); секреты не читаются.

Проверено в браузере: вход younaxo_ через живой Turnstile (тестовый ключ),
`(3) twomc.su` + бейдж «3» на логотипе, сохранение после навигации, сброс после
«прочитать все»; ColorPicker в диалоге «Новая роль» поверх модалки (z 55 > 50);
375/430/768/1024/1440 — без горизонтального скролла, футер у низа.
