# giveaway — разовый розыгрыш «Анархия Новой Эры»

Всё, что относится к розыгрышу и не является кодом сайта. Источник: `docs/agent-prompts/16-GIVEAWAY-NEW-ERA.md`.

## Что где лежит

- `docs/ADR-G001-session-time-counting.md` — решения по подсчёту времени и контракт для плагина (подпись, события).
- `docs/ADR-G002-codes-and-tickets.md` — фаза 2: cookie-сессия, коды, билеты, `redeem`/`progress` для плагина, контракт для страницы (`codes`, `codes/status`, `public`).
- `docs/MASTER-PROMPT-16.1.md` — задание фазы 1, работа 1 (бэкенд).
- Бэкенд: `apps/api/src/modules/giveaway/` (модуль, выключен флагом `GIVEAWAY_ENABLED`).
- Миграция: `apps/api/prisma/migrations/20261119120000_giveaway_phase1/` (expand-only, ждёт ревью; на production применяет владелец).
- Утилита ключа сервера: `apps/api/scripts/giveaway-server-key.ts`.
- Плагин: `giveaway/plugin` (см. раздел «Плагин» ниже). Мини-выкладка (docker compose, nginx, скрипты) — раздел «Мини-выкладка» ниже и `deploy/RUNBOOK.md`.

## Как запустить бэкенд

Окружение: `GIVEAWAY_ENABLED=true`, `GIVEAWAY_MASTER_SECRET` (не короче 32 байт; на VDS его генерирует `deploy/setup-server.sh` на сервере: `openssl rand -hex 32` сразу в файл 0600, без вывода, по решению владельца 2026-11-19; локально - любое значение >= 32 байт), `GIVEAWAY_ALLOWED_SERVERS=<id сервера>`. Остальные ключи `GIVEAWAY_*` необязательны (см. ADR). Без флага или секрета приёмник отвечает 503.

Ключ сервера для плагина (в файл, не в консоль):
`GIVEAWAY_MASTER_SECRET=... npx ts-node scripts/giveaway-server-key.ts --server-id <id> --version 1 --out <файл>` (из `apps/api`).

Тесты: `npx jest src/modules/giveaway` (из `apps/api`).

## Плагин

`giveaway/plugin` — универсальный Spigot-плагин 1.21.4–1.21.11 (Java 21, `compileOnly spigot-api 1.21.4`, без NMS и Paper-API, `api-version: 1.21`). Зависимостей времени выполнения нет. Контракт подписи и событий — `docs/ADR-G001-session-time-counting.md`, раздел «Контракт для плагина».

Сборка (из `giveaway/plugin`, нужен JDK 21; Gradle скачивается wrapper-ом в `~/.gradle`, wrapper проверяет sha256 дистрибутива):
`./gradlew build` (Windows: `gradlew.bat build`) → `build/libs/TwoMCGiveaway-1.0.0.jar`. Тесты JUnit 5 запускаются в составе `build`.

Что делает:

- `join` и `quit` отправляются событием сразу; раз в минуту на каждого онлайн-игрока уходит `heartbeat` с `active=true/false`.
- AFK: 5 минут (`afkMinutes`) без смены блока или поворота головы, чата, команды, взаимодействия или клика в инвентаре. Учёт — одна запись в `ConcurrentHashMap` на событие, без тяжёлой работы в `PlayerMoveEvent`.
- Ввод-вывод не на главном потоке: события копятся в памяти, запись очереди и HTTP (`java.net.http.HttpClient`, редиректы запрещены) идут в асинхронной задаче каждые 5 с, пакеты до 100 событий.
- Подпись: HMAC-SHA256, `timestamp`, `nonce` из `SecureRandom` (на каждую попытку новый), sha256 тела; путь всегда `/api/giveaway/v1/events`.
- Очередь: `plugins/TwoMCGiveaway/queue.log` (переживает рестарт), событие удаляется только после 2xx. Удаление не переписывает файл на каждый ack: id дописывается в `queue.ack`, `queue.log` компактируется пакетно (атомарно, вне главного потока; на главном потоке под блокировкой только копия значений). Переполнение (`maxQueueEvents`) — громкое предупреждение в лог не чаще раза в 5 минут.
- Коды ответов: 2xx — подтверждено; в теле 200 поле `rejected` учитывается (счётчик в `/giveawaytime`, агрегат по причинам в лог раз в 10 минут, без ников и UUID; `in_future` — подсказка проверить NTP). 413 и 422 — пакет в `dead-letter.log` без повтора. 400 (может быть ответом прокси/WAF) — повтор с backoff как 5xx, после 5 подряд 400 для одного и того же пакета — в dead-letter с причиной `http_400_x5`. Сеть, 401, 403, 429, 5xx, прочее — повтор с экспоненциальной задержкой (10 с … 15 мин, ±20%, `Retry-After` учитывается). События старше 72 ч (с запасом 5 мин) отбрасываются локально.
- `dead-letter.log` ограничен: при достижении ~5 МБ переименовывается в `dead-letter.log.1` (прежний `.1` заменяется), суммарно не больше ~10 МБ.
- heartbeat отправляется по реальным часам (корзина минуты `System.currentTimeMillis`, проверка каждые 5 с), а не по счётчику тиков: лаг сервера не сдвигает и не теряет минуты.
- Ники не по `^[A-Za-z0-9_]{1,16}$` (например Bedrock через Floodgate) пропускаются, иначе сайт отклонил бы весь пакет; счётчик виден в `/giveawaytime`.

Настройка `plugins/TwoMCGiveaway/config.yml`: `apiUrl` (адрес сайта без пути, `https`; `http` только для localhost), `serverId`, `keyVersion`, `keyFile`, `afkMinutes`, `maxQueueEvents`. Переопределение окружением: `GIVEAWAY_API_URL`, `GIVEAWAY_SERVER_ID`, `GIVEAWAY_KEY_VERSION`, `GIVEAWAY_KEY_FILE`. Сам ключ (64 hex-символа, файл из утилиты бэкенда) лежит в отдельном файле вне репозитория и вне config.yml и в логи не попадает. Без URL, `serverId` или ключа плагин не отправляет и пишет одно предупреждение; события копятся в очереди и уйдут после настройки и перезапуска.

Команда `/giveawaytime` (право `giveaway.admin`, по умолчанию op): настроена ли отправка, режим online-mode, размер и возраст очереди, последний успех, ошибка связи и время следующей попытки, счётчики отброшенных событий. Ключ не показывается.

Безопасность: при `online-mode=false` в лог пишется громкое предупреждение (риск подмены ника, см. ADR). За прокси нужен `online-mode=true` на прокси и защищённый проброс UUID. Часы сервера должны быть синхронизированы по NTP (окно ±300 с).

### Фаза 2: билеты, прогресс, PlaceholderAPI

Контракт: `docs/ADR-G002-codes-and-tickets.md`, разделы 6 и 7. Подпись та же, что у `/events`, но подписываемый путь свой: `/api/giveaway/v1/redeem` и `/api/giveaway/v1/progress`.

- `/giveaway <код>` (псевдоним `/ticket`, право `giveaway.use`, по умолчанию у всех; только игрок). Код нормализуется как на бэкенде (регистр, пробелы и дефисы, `O`->`0`, `I`/`L`->`1`). Запрос асинхронный, ответ игроку на главном потоке. `not_enough`: «Набрано X ч Y мин из 50 ч, осталось …» (порог из ответа); `issued`: билет крупно (чат и title, звук); `repeat`: «Ваш билет: K417»; `invalid_code`: нейтральное сообщение; лимит, сеть, любой неожиданный ответ: «Попробуйте позже». Кулдаун на игрока `cooldownSeconds` (5 с). Код нигде не логируется. Неверный по формату код уходит на сервер как нулевой (порядок проверок ADR: билет уже есть, мало времени, иначе `invalid_code`).
- Прогресс: раз в минуту пакетом (до 100) `POST /progress` по онлайн-игрокам; кэш на игрока (минуты, порог, остаток, процент, qualified, билет). Пауза при ошибках сети (1, 2, 4, 5 мин). При `qualified` без билета игрок один раз получает чат, title и звук `ENTITY_PLAYER_LEVELUP`; отметка хранится в `plugins/TwoMCGiveaway/notified.txt` и переживает рестарт. Если игрок набрал порог офлайн, уведомление придёт при первом опросе после входа.
- PlaceholderAPI (softdepend, версия 2.11.6 compileOnly; без него плагин работает): `%twomcgiveaway_hours%`, `_minutes`, `_remaining` (`ч:мм`), `_percent`, `_qualified` (`да`/`нет`), `_ticket` (или `-`), `_threshold_hours`, `_start`, `_cutoff`. Даты и порог берутся ТОЛЬКО из ответа сайта `/progress` (`startText`, `cutoffText` по МСК, `thresholdMinutes`); до первого ответа они показывают `—`, сообщение `not_enough` берёт порог из ответа `/redeem`. Подробности и подключение к панели: `plugin/panel/README.md`, запасной вариант через TAB: `plugin/panel/tab-example.yml`.
- `/giveawaytime` дополнен статусом опроса прогресса (успешные и неудачные опросы, последний успех, ошибка, размер пакета, размер кэша).
- Настройки: в config.yml остаются только `apiUrl`, `serverId`, `keyVersion` (допущение Q93: версия ключа задаётся вместе с `keyFile`), `keyFile` (и фазы 1 `afkMinutes`, `maxQueueEvents`). Старые ключи `thresholdHoursDefault`, `cutoffText`, `cooldownSeconds`, `progress.*` убраны из шаблона; если они есть в конфиге сервера, плагин их игнорирует и пишет одно предупреждение. Служебные значения (допущение) заданы в коде: кулдаун 5 с, опрос раз в минуту, уведомление о пороге; override только через окружение: `GIVEAWAY_COOLDOWN_SECONDS` (1..60), `GIVEAWAY_PROGRESS_ENABLED=false`, `GIVEAWAY_PROGRESS_NOTIFY=false`.
- ВНИМАНИЕ (логи команд): команда `/giveaway <код>` попадает в лог консоли Spigot и в плагины журналирования команд (CoreProtect, spy и подобные). Исключите команды `/giveaway` и `/ticket` из их логов (по документации каждого плагина) и из пересылки логов в Discord и внешние системы. Дополнительная защита: код живёт 10 минут и одноразовый.

## Страница

Маршрут `/giveaway` в `apps/web` (`src/app/giveaway/page.tsx`), код — `apps/web/src/features/giveaway/`. Страница клиентская: ходит только на `/api/giveaway/v1/{public,codes,codes/status}` того же домена (`credentials: same-origin`, cookie `gw_session`), к API сайта не обращается. Все даты — по МСК (`Intl`, `Europe/Moscow`).

Каркас: шапка и футер — те же компоненты, что на основном сайте (`components/shell/site-header.tsx`, `site-footer.tsx`), тема и токены общие, сообщения (429/503/сеть, копирование кода) — общий toast (`components/ui/toast`, кнопка «Повторить»). Внешний режим включает `ShellModeProvider` (`lib/site/shell-mode.tsx`), когда на сервере `GIVEAWAY_ONLY=true`: ссылки шапки и футера абсолютные на `MAIN_SITE_URL` (env сервера, по умолчанию `https://twomc.su`; «Войти» → `/login` основного сайта, логотип → корень), «o» в «twomc.su» без оранжевого, блоки футера, которым нужен API основного сайта («Статус серверов», соцсети из настроек), без запросов (пустое состояние/значения по умолчанию). Без `GIVEAWAY_ONLY` каркас не меняется.

Состояния: до старта (обратный отсчёт), идёт, код выдан и ожидание ввода в игре (опрос `codes/status` раз в 2,5 с только пока код pending и вкладка видима, таймер жизни кода, «Скопировать», «Новый код»), анимация перебора символов и итоговый билет с ником (при `prefers-reduced-motion` сразу билет), «билет уже получен», ошибки (429, 503, сеть, код истёк), розыгрыш завершён. При pending `codes/status` может содержать `lastAttempt: {result:"not_enough", minutes, remainingMinutes, thresholdMinutes}`: страница показывает «Время ещё не набрано: X ч Y мин из 50 ч, осталось …», код остаётся действующим, поллинг продолжается.

Переменные окружения web:

- `GIVEAWAY_ONLY=true` (на сервере web): все маршруты, кроме `/giveaway`, `/api/giveaway/*` и статики, редиректят (307) на `/giveaway` (`src/middleware.ts`). Без флага сайт не меняется.
- `NEXT_PUBLIC_GIVEAWAY_SOCIAL_TELEGRAM`, `_DISCORD`, `_YOUTUBE`, `_TIKTOK`, `_VK` (необязательно, только http/https): адреса соцсетей в футере страницы в режиме `GIVEAWAY_ONLY`; единственный конфиг - `src/features/giveaway/social-links.ts`. По умолчанию пусто: иконка неактивна (`aria-disabled`, подсказка «Скоро»). В режиме `GIVEAWAY_ONLY` шапка без навигации, «Войти», «Статус серверов» и разделы футера без страниц - «Скоро» (неактивны).
- `NEXT_PUBLIC_GIVEAWAY_API_BASE` (необязательно): префикс API, если он не на том же домене; по умолчанию пусто.
- `NEXT_PUBLIC_GIVEAWAY_MOCK=1`: только dev (при `NODE_ENV=production` игнорируется): API заменяется моком, сценарий выбирается `?mock=before|running|pending|not_enough|ticket|redeemed|expired|limit|down|offline|finished`. При моке (и не production) справа внизу видна кнопка «Состояния (dev)» с меню сценариев (Tab/Enter/Escape); панель грузится динамическим `import()` за литеральным условием `process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_GIVEAWAY_MOCK === "1"`, в production-бандл не попадает (тест проверяет условие и отсутствие панели).

`GIVEAWAY_ONLY` и middleware (Next 14.2.35, self-hosted `next start`): edge-песочница middleware наполняет `process.env` из окружения процесса в рантайме (`sandbox/context.js`, `buildEnvironmentVariablesFrom`), а при сборке инлайнятся только `NEXT_PUBLIC_*` и значения из `next.config` `env`. Значит `GIVEAWAY_ONLY` для middleware достаточно задать при запуске `next start`; пересборка не нужна. Оговорка: `generateMetadata` в `layout.tsx` на статически предсобранных страницах вычисляется при сборке, поэтому в Docker-образе мини-выкладки флаг нужно задавать и на этапе сборки (build arg/ENV), иначе в метаданные может попасть запрос `/site/settings`; на редирект это не влияет.

Проверка: `pnpm --filter @twomc/web exec vitest run src/features/giveaway`. Скриншоты основных состояний (dark, desktop 1280 и mobile 500, на моках): `docs/screenshots/phase2/`. Снимки 320 px (`*-320.png`, включая `not_enough`) сняты headless Chromium (chrome-headless-shell из Playwright) с `--window-size=320,…` на dev-сервере с моком; Edge уже 500 px не сужается.

## Безопасность выкладки

- Файл ключа сервера: Linux - права `0600`, владелец - пользователь процесса сервера; Windows - отдельная папка с наследованием прав только для пользователя сервера.
- Контрольная сумма `gradle/wrapper/gradle-wrapper.jar` плагина сверена с официальной `gradle-8.14.5-wrapper.jar.sha256` (`7d3a4ac4…6172`; сверил chief 2026-11-19).

## Мини-выкладка

Конфигурация подготовлена в `giveaway/deploy/` (не запускалась): `docker-compose.yml` (postgres 16, redis 7 с паролем, api, nginx; порты БД/Redis/API наружу не публикуются, контейнеры с `no-new-privileges` и `cap_drop`, nginx и api не от root), `nginx/giveaway.conf` (HTTPS, 80 -> 443, только `/api/giveaway/` проксируется, остальное 404; заготовка SSE; тело `events` до 64 КБ), `secrets/*.env.example` (только плейсхолдеры), `RUNBOOK.md` (шаги владельца и агента, откат). Секреты - env-файлы вне репозитория (`/srv/twomc-giveaway/secrets/*.env`, 0600). Проверка синтаксиса: `GIVEAWAY_SECRETS_DIR=<каталог с копиями *.env.example> docker compose -f giveaway/deploy/docker-compose.yml config -q`.

Скрипты выкладки (не запускались на сервере, проверены `bash -n`; подробности - `deploy/RUNBOOK.md`): `deploy/setup-server.sh` (первичная настройка VDS: пользователь без root и без sudo, ufw с портом sshd из sshd -T, fail2ban, отдельный шаг harden-ssh, UTC/NTP, Docker, каталоги, секреты на сервере без вывода, certbot-хуки, ежедневный бэкап 7+4), `deploy/deploy.sh` (выкладка коммита по ssh, миграции только на БД мини-выкладки, healthcheck, автооткат), `deploy/tools/` (`giveaway-key.sh` - ключ сервера игры, `sign-event.sh` - подписанное событие для curl, `e2e-giveaway.sh` - e2e конкурентности на одноразовой БД), `deploy/minecraft-test/` (тестовый MC 1.21.4 и 1.21.11 на том же VDS), `deploy/POST-DEPLOY-CHECKLIST.md` (проверки после выкладки).

### Режим «всё остальное выключено»

Режим `GIVEAWAY_ONLY=true` реализован (коммит 957fe069): API поднимает только ядро (конфиг, Prisma, Redis, health) и модуль розыгрыша; остальные модули и их таймеры не загружаются. Заглушки `JWT_*`, `TWO_FACTOR_ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `COOKIE_*` не нужны. Флаги `LITEBANS_ENABLED`, `BRIDGE_ENABLED`, `STORE_DELIVERY_ENABLED`, `QUICK_BUY_ENABLED`, `DELIVERY_RECONCILE_ENABLED`, `PAYMENT_PROVIDER=` остаются выключенными в compose как дополнительный барьер. Обязательны `GIVEAWAY_ENABLED=true`, `GIVEAWAY_MASTER_SECRET` (задаёт только владелец), `DATABASE_URL`, `TRUST_PROXY=1`. Переменные и порядок выкладки - `deploy/RUNBOOK.md`, раздел 2.

### Миграции

`prisma migrate deploy` применяет все 31 миграцию (в т.ч. не относящиеся к розыгрышу); выбрать только `20261119120000_giveaway_phase1` нельзя штатно, а модули, которые остаются в процессе (таймеры news, announcements, статус серверов, delivery), обращаются к своим таблицам каждую итерацию и без них пишут ошибки в лог. Вывод: ДОПУСТИМО применять все миграции, при условии что БД мини-выкладки - отдельная пустая БД на отдельном сервере/в отдельном томе (не production twomc.su): таблицы розыгрыша не имеют внешних ключей на остальные, две миграции с `INSERT` (настройки соцссылок и backfill прав отчётов) добавляют лишь служебные строки справочников. Команда (не выполнять до разрешения владельца): `docker compose -f giveaway/deploy/docker-compose.yml --profile ops run --rm migrate`. Перед этим убедиться, что `DATABASE_URL` указывает на БД `giveaway` из compose, а не на production. Seed не выполняется. Применяет миграции владелец или агент по его явной команде; деструктивные операции запрещены. Если после `GIVEAWAY_ONLY` остальные модули не поднимаются, достаточно будет одной миграции розыгрыша (вариант применяется через `prisma migrate deploy` на БД с одной выбранной миграцией - только после отдельного ревью).

## Страница

- Призы: `giveaway/config/prizes.json` — единственный источник (место, название, описание, картинка, служебное `value`, флаги `showValue`, раскладка пьедестала `podium.order`/`heights` и ряд `rest.order`). Значения (`value`) на странице не показываются, пока `showValue` не включён и глобально, и у приза.
- Подключение к web без копий: `apps/web/src/features/giveaway/prizes.ts` импортирует JSON по относительному пути из корня репозитория, `prize-images.ts` — картинки из `giveaway/assets/prizes/` статическим импортом (бандлер сам кладёт их в сборку). Конфиги tsconfig/next.config не менялись. Конфиг проверяется при загрузке (`validatePrizesConfig`, вручную, zod в web нет) и тестом.
- Новая картинка: файл (webp или png до 200 КБ, либо svg) в `giveaway/assets/prizes/`, запись в `prize-images.ts`, источник в `docs/IMAGE-SOURCES.md`.
- Раскладка (по умолчанию): сверху название, крупный таймер (до старта или до конца, по МСК; после отсечки «Розыгрыш завершён»), «как участвовать» тремя шагами (порог и даты из `/public`) и якорь «Получить код»; места 1–5 — отдельные крупные разделы по центру одно под другим, 6–10 — по два в ряд (на телефоне одна колонка); внизу рабочая область без карточки. Код: `giveaway-hero.tsx`, `prize-sections.tsx`, `reveal.tsx` (появление при прокрутке, при `prefers-reduced-motion` без анимации), `layout.ts`.
- Старый карточный вариант сохранён: dev-параметр `?layout=cards` (только вне production; в production игнорируется), например `/giveaway?mock=running&layout=cards`.
- Иллюстрации призов: `giveaway/assets/prizes/*-art.svg` (оригинальные, см. `docs/IMAGE-SOURCES.md`); старые `*.svg` не удалены.
- Раскладка: телефон — 1 колонка, узкий экран — 2 колонки (порядок 1–10), от md — пьедестал мест 1–5 и ряд 6–10. Блок призов стоит выше рабочей области с кодом и билетом.
- Отслеживание билета (Q99): страница `apps/web/src/app/giveaway/ticket/[token]/page.tsx` (noindex, без призов и шапки розыгрыша) показывает номер, ник, наиграно и статус по `GET /api/giveaway/v1/tickets/track/:token`. Кнопки «Сохранить билет» (PNG на клиенте, `twomc-ticket-K417.png`) и «Скопировать ссылку» — `ticket-actions.tsx`. Барабан — `ticket-reel.tsx` (лента на символ, ~3 с, остановка слева направо, при `prefers-reduced-motion` сразу результат). nginx: `location ^~ /api/giveaway/` уже покрывает маршрут.

## Страница: итоги и эфир (фаза 3)

- Пока розыгрыш не показан в эфире, `/giveaway` выглядит как раньше. Как только `GET /api/giveaway/v1/public/results?mode=live` возвращает `state: "results"`, страница переключается на итоги (`giveaway-results.tsx`): победители выводятся по очереди в порядке `revealOrder` (от 10 места к 1), затем дисквалифицированные и блок «Проверка честности» (хэш снимка, алгоритм, зерно, порядок билетов). При `prefers-reduced-motion` весь список выводится сразу.
- Обновление: поток SSE `/api/giveaway/v1/stream?mode=` служит только сигналом (`results`, `reset`, `ready`), по сигналу итоги запрашиваются заново; пока поток недоступен (или нет `EventSource`) - опрос раз в 5 с (`use-live-results.ts`). Ошибки итогов обычную страницу не ломают.
- Тест: `/giveaway?mode=test` показывает тестовый эфир только админ-сессии (иначе экран «войдите в админку»); везде метка «ТЕСТ» (`test-badge.tsx`).
- Моки (dev, `NEXT_PUBLIC_GIVEAWAY_MOCK=1`): сценарии `results` и `results-test` в `?mock=` (`results-mock.ts`).
- Картинки призов в итогах и админке берутся из `prize-images.ts` по имени файла из `imageFile` - тем же статическим механизмом, что и `giveaway/assets/prizes/`; отдельного эндпоинта для картинок нет, неизвестное имя - заглушка.

## Админка (фаза 3)

- Адрес: `admin.giveaway.twomc.su` (env `GIVEAWAY_ADMIN_HOST` переопределяет). Только при `GIVEAWAY_ONLY=true`, `src/middleware.ts` + `giveawayHostRoute` (`giveaway-only.ts`): на хосте админки `/` -> `/giveaway/admin` (rewrite), `/giveaway/**` проходит, остальное -> `/`; на других хостах `/giveaway/admin` -> `/giveaway` (307). Локально (не production, `localhost`) админка открыта по `/giveaway/admin`. Без флага основной сайт не затрагивается (тест `giveaway-host.test.ts`). nginx: `deploy/nginx/giveaway.conf`.
- Вход: кнопка «Войти через Discord» (`/api/giveaway/v1/admin/auth/login`); при любом 401 - экран входа; тексты отказа нейтральные. Выход - «Выйти». CSRF: токен из `GET /admin/session` уходит заголовком `X-Giveaway-Csrf` на все POST/PATCH (`admin-api.ts`).
- Разделы: Розыгрыш (заморозить, «Рассчитать…» с подтверждением фразой «РАССЧИТАТЬ» и хэшем снимка, показать в эфире, дисквалификация с причиной 3-300 символов), Билеты (поиск, профиль игрока), Настройки (порог, даты по МСК), Призы, Аудит, Тест (время, билеты, массовое наполнение, сброс; только при включённом тестовом режиме). Переключатель «Боевой/Тест»; в тесте постоянная метка «ТЕСТ».
- Локально на моках: `NEXT_PUBLIC_GIVEAWAY_MOCK=1 pnpm --filter @twomc/web dev`, открыть `/giveaway/admin` (мок админ-API: вход сразу выполнен).
- Проверка: `pnpm --filter @twomc/web exec vitest run src/features/giveaway`.
