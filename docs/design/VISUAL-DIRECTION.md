# VISUAL DIRECTION — twomc.su

Практический design contract для frontend TwoMC. Статус: **production
(решение владельца 2026-10-08/09)** — направление «Полдень», тёмная тема
основная, светлая — вторичная, бренд — оранжевый, стеклянные материалы
запрещены. Альтернативные кандидаты удалены из кода.

Старые документы `docs/design/CLAUDE-DESIGN-*` используются только как
перечень страниц/функций/состояний/permissions; их визуальные указания
недействительны.

## 0. Решение

**Направление:** «Полдень» (`daylight`) — единственная система.
**Основная тема:** тёмная (`[data-theme='dark']`, default, без theme flash).
**Вторичная тема:** светлая (`:root` / `[data-theme='light']`), те же
компоненты и те же семантические токены.
**Бренд:** оранжевый Tangerine `#F26A1B` (светлая) / `#F87A30` (тёмная).
**Шрифты:** Onest (UI) · Literata (редакционный текст) · JetBrains Mono
(данные), self-hosted через fontsource.
**Overlay:** только плотные поверхности `--surface-overlay` + граница +
тень + верхняя кромка. Glass / frosted / liquid / backdrop-blur —
**запрещены** (решение владельца 2026-10-09, ADR-0055).

Архивные кандидаты «Раскалённое» и «Пульт» удалены из `/design-lab`,
токенов и шрифтов (история — в `docs/design/DESIGN-CRITIQUE.md`).

## 1. Character / mood (общее)

TwoMC — серьёзный digital-продукт Minecraft-сообщества нового поколения, не
«сайт сервера» и не SaaS-шаблон. Узнаваемость строится на одном фирменном
цвете (оранжевый), одной типографической паре и одной signature-композиции
первого экрана; всё остальное — дисциплина и тишина. Детских кубиков,
grass-block-декора и случайных скриншотов нет.

## 2. Design philosophy (общее)

1. Контент и данные — это и есть изображение: онлайн, статус серверов,
   ники, роли, события.
2. Смелость тратится в одном месте (signature направления), остальное —
   нейтрально и предсказуемо.
3. Каждый эффект имеет причину (иерархия, обратная связь, переход,
   пространственное понимание) — иначе его нет.
4. Компоненты существуют ради продукта: на странице только то, что
   улучшает UX конкретной задачи.
5. Backend — источник истины по permissions; UI только скрывает недоступное.

## 3. Visual hierarchy (общее)

- Один h1 на страницу; заголовки уровней — размером и весом, не цветом.
- Иерархия действий: одна primary-кнопка на экран/диалог; остальные —
  secondary/outline/ghost; опасные — destructive и только в AlertDialog.
- Статус передаётся иконкой + текстом + цветом (StatusBadge), никогда
  только цветом.
- Числа в таблицах/счётчиках — табличные цифры (`.tabular`), выравнивание
  вправо.

## 4. Typography

Общее: одна UI-семья (+ максимум одна дополнительная с чёткой ролью),
Cyrillic-subset обязателен, загрузка через `next/font` (self-hosted,
`display: swap`), не более 4 весов в проде. Шкала: 12 / 13 / 14 / 16 / 18 /
20 / 24 / 30 / 36 / 48 / 60 / 72 px; строка 1.45–1.55 для текста, 1.1–1.2
для display. Длина строки ≤ 80 символов. Заголовки — `text-wrap: balance`,
абзацы — `pretty`. Без ALL-CAPS eyebrow-лейблов и «одного слова цветом» в
заголовке. Конкретная пара — по разделу 0.

## 5. Color system (общее)

Только семантические токены (`apps/web/src/styles/tokens.css`,
RGB-каналы для alpha): `background/foreground`, `surface`, `surface-raised`,
`surface-overlay`, `surface-sunken`, `muted/muted-foreground`,
`subtle-foreground`, `primary/-hover/-active/-foreground/-soft/-soft-foreground`,
`border/-strong/-subtle`, `ring`, `success|warning|destructive|info` (+
`-foreground`, `-soft`). Компоненты не знают hex. Направление/тема —
`data-direction` / `data-theme` на корне.

## 6. Orange brand usage (общее)

Оранжевый — один акцент, без второго бренд-цвета. Используется для:
primary-действия, активного пункта навигации, фокус-кольца, «живых» данных
(онлайн/live), выделения выбранного. Не используется для: больших фонов,
декоративных градиентов (одно исключение — «жар» hero в `ember`), текста
мелкого размера на светлом (для ссылок — затемнённый
`primary-soft-foreground`). Текст на оранжевой заливке — тёмный
(`primary-foreground`), контраст ≥ 4.5:1 проверен для всех трёх оттенков.

## 7. Neutral palette

По направлению (раздел 0). Общее: нейтрали несут температуру направления
(тёплый уголь / прохладная бумага / чистый графит), но внутри одного
направления — одна температура; «тонированный чёрный #111» как фон запрещён.

## 8. Surface system (общее)

Уровни: `background` → `surface` (контент) → `surface-raised` (модули,
карточки) → `surface-overlay` (floating/overlay). `surface-sunken` — зоны
ввода/фильтров/кода. Карточки — `Card variant raised|flat|sunken`; не
превращать всё в карточки: таблица, список, форма живут на `surface` без
рамки-карточки, если не нужна группировка.

## 9. Border system (общее)

1 px, три силы: `border-subtle` (разделители строк), `border` (контуры
контролов/карточек), `border-strong` (hover/активные контуры). Без
градиентных рамок.

## 10. Radius system

Токены `--radius-sm/--radius/--radius-lg/--radius-xl`; компоненты не
используют `rounded-xl`-константы напрямую. Исключения: `rounded-full`
только у Switch, Progress-трека, индикаторов и круглых аватаров (в
направлениях с круглыми аватарами). Значения — по разделу 0.

## 11. Shadow / depth system

`--shadow-sm/--shadow/--shadow-lg` + `--edge-highlight` (верхняя кромка для
тёмных поверхностей). Правило: тень только у «поднятых» модулей и overlay;
таблицы, формы, строки — без теней. Никакого glow.

## 12. Spacing system (общее)

База 4 px; плотность через токены `--control-h(-sm/-lg)`, `--control-px`,
`--card-p`, `--gap`, `--row-h`. Шкала отступов секций: 32 / 48 / 64 px
(desktop), 24 / 32 / 48 (mobile). Touch-target ≥ 40 px на coarse pointer
даже при плотных контролах.

## 13. Grid / layout (общее)

Публичный сайт: контейнер до 1200 px (1440 для таблиц/дашбордов), 12-колонок
на ≥ 1024, 1 колонка на 375. Админ: sidebar (ширина по направлению) + topbar
+ контент; на < 1024 sidebar → Sheet. Breakpoints проверки: 375 / 768 /
1024 / 1440. Никакого горизонтального скролла страницы; таблицы — либо
карточки, либо контейнер с `overflow-x-auto` и `min-w`.

## 14. Icon system (общее)

Одна библиотека — **Lucide** (stroke 2, 16 px в контролах, 20 px в
навигации, 24 px в empty/error). Декоративные — `aria-hidden`; icon-only
кнопки — `aria-label`. Эмодзи вместо иконок запрещены. Логотипы сервисов —
Simple Icons/SVGL по необходимости. Графические префиксы ролей — PNG с CDN
через `RolePrefix` (целочисленный масштаб, pixelated).

## 15. Motion language (общее)

Только `transform`/`opacity`; длительности из токенов (`--motion-fast /
--motion / --motion-slow`), easing из токенов; без bounce, без
`transition: all`, без анимаций появления по скроллу и hover-translateY.
Overlay: pop-in (scale 0.96 + 2–8 px) / fade. Drawer — естественное
движение панели (vaul). Toast — короткое появление/уход.
`prefers-reduced-motion` гасит всё глобально; длительные движения (marquee)
имеют паузу.

## 16. Overlay language (общее)

Единая поверхность `surface-overlay` + `border` + `shadow-lg` +
`edge-highlight`, z-50, portal, `overscroll-contain`, ширина ≤
`calc(100vw - 2rem)`. Dialog — обычный интерактивный контент; AlertDialog —
только осознанное подтверждение опасного действия (destructive-кнопка
отличается визуально); Sheet — боковые панели фильтров/деталей; Drawer /
BottomSheet — mobile; QuickView — просмотр объекта без перехода.
Mobile-замены: dropdown → BottomSheet/ActionSheet, большой dialog → sheet,
context menu → action sheet.

## 17. Tooltip / popover / dialog language (общее)

Tooltip (hover + focus, delay 400 мс, стрелка, flip/collision, portal) —
короткая подсказка, не интерактивен; Rich/Shortcut/Help/Validation —
варианты того же компонента. Toggletip — по нажатию (touch и важная
информация). Popover — произвольный интерактивный контент. DropdownMenu —
список действий. ContextMenu — действия над объектом (правый клик /
long-press). HoverCard — расширенная карточка (пользователь). `title=""`
запрещён.

## 18. Mobile behavior (общее)

Навигация — кнопка-меню → Sheet (или нижний FloatingDock для ключевых
разделов); таблицы → карточки (DataGrid) или скролл; формы — одна колонка,
кнопки на всю ширину; overlay — bottom sheet; safe-area учитывается
(`env(safe-area-inset-*)`). Desktop не «сжимается», а перестраивается.

## 19. Accessibility rules (общее)

Семантический HTML; `<button>` для действий, `<a>` для навигации;
`:focus-visible` виден везде (глобальный outline из токена `ring`);
контраст 4.5:1 для текста, 3:1 для крупного/UI; подписи у всех полей
(`Field`), ошибки рядом с полем + `aria-invalid`/`aria-describedby` +
`role=alert`; live-region для async-сообщений (toast); skip-link на `main`;
клавиатура для меню/диалогов/таблиц/дерева; touch ≥ 40 px; reduced motion;
цвет не единственный носитель смысла.

## 20. Anti-patterns (общее, запрещено без веской причины)

purple/blue AI-градиенты; glow вокруг элементов; glass-card grid и
«liquid glass» на карточках/таблицах/формах; 30 px radius везде; pill
everything; плавающие blob-ы; bento ради bento; fake metrics; generic hero
copy; sparkles; иконка-в-цветном-квадрате в каждом блоке; одинаковые
карточки по всей странице; hover translateY везде; слишком много motion;
gradient-рамки; «premium» только за счёт blur; `title=""` как tooltip;
эмодзи как иконки; Minecraft-клише (grass block как декор, случайные
скриншоты) ; `if (role === 'owner')` в UI вместо permissions.
