# giveaway — разовый розыгрыш «Анархия Новой Эры»

Всё, что относится к розыгрышу и не является кодом сайта. Источник: `docs/agent-prompts/16-GIVEAWAY-NEW-ERA.md`.

## Что где лежит

- `docs/ADR-G001-session-time-counting.md` — решения по подсчёту времени и контракт для плагина (подпись, события).
- `docs/MASTER-PROMPT-16.1.md` — задание фазы 1, работа 1 (бэкенд).
- Бэкенд: `apps/api/src/modules/giveaway/` (модуль, выключен флагом `GIVEAWAY_ENABLED`).
- Миграция: `apps/api/prisma/migrations/20261119120000_giveaway_phase1/` (expand-only, ждёт ревью; на production применяет владелец).
- Утилита ключа сервера: `apps/api/scripts/giveaway-server-key.ts`.
- Плагин: `giveaway/plugin` (см. раздел «Плагин» ниже). Мини-выкладка (docker compose, nginx) — отдельная работа, пока не добавлена.

## Как запустить бэкенд

Окружение: `GIVEAWAY_ENABLED=true`, `GIVEAWAY_MASTER_SECRET` (не короче 32 байт, задаёт владелец), `GIVEAWAY_ALLOWED_SERVERS=<id сервера>`. Остальные ключи `GIVEAWAY_*` необязательны (см. ADR). Без флага или секрета приёмник отвечает 503.

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

## Безопасность выкладки

- Файл ключа сервера: Linux - права `0600`, владелец - пользователь процесса сервера; Windows - отдельная папка с наследованием прав только для пользователя сервера.
- Контрольная сумма `gradle/wrapper/gradle-wrapper.jar` плагина сверена с официальной `gradle-8.14.5-wrapper.jar.sha256` (`7d3a4ac4…6172`; сверил chief 2026-11-19).

## Мини-выкладка

Конфигурация подготовлена в `giveaway/deploy/` (не запускалась): `docker-compose.yml` (postgres 16, redis 7 с паролем, api, nginx; порты БД/Redis/API наружу не публикуются, контейнеры с `no-new-privileges` и `cap_drop`, nginx и api не от root), `nginx/giveaway.conf` (HTTPS, 80 -> 443, только `/api/giveaway/` проксируется, остальное 404; заготовка SSE; тело `events` до 64 КБ), `secrets/*.env.example` (только плейсхолдеры), `RUNBOOK.md` (шаги владельца и агента, откат). Секреты - env-файлы вне репозитория (`/srv/twomc-giveaway/secrets/*.env`, 0600). Проверка синтаксиса: `GIVEAWAY_SECRETS_DIR=<каталог с копиями *.env.example> docker compose -f giveaway/deploy/docker-compose.yml config -q`.

### Режим «всё остальное выключено»

Отдельного режима «только розыгрыш» в коде нет: `AppModule` всегда подключает все модули, `main.ts` поднимает их целиком.
- Выключается существующими флагами: `LITEBANS_ENABLED=false` (опрос наказаний), `BRIDGE_ENABLED=false`, `STORE_DELIVERY_ENABLED=false` и `DELIVERY_RECONCILE_ENABLED=false` (выдача заказов), `QUICK_BUY_ENABLED=false` (по умолчанию выключен в production), `PAYMENT_PROVIDER=` (в production допустимо только пустое). Вход через Discord/Telegram, SMTP, VAPID, Twitch/YouTube - без ключей бездействуют. Это уже заложено в compose.
- Остаётся запущенным и требует таблиц БД: все прочие Nest-модули (auth, users, news, store и т.д.), их публичные маршруты (закрыты nginx, но доступны внутри сети), таймеры процесса (`news`, `announcements`, сборщик статуса серверов Minecraft, `delivery-worker`, ретеншн хранилища и аудита) - отдельного флага у них нет. Этого достаточно для работы, но это лишняя поверхность и фоновые запросы к БД.
- Предложение минимального `GIVEAWAY_ONLY=true` (изменение кода, отдельный срез с ревью): в `app.module.ts` собирать `imports` из ядра (`ConfigModule`, `ThrottlerModule`, `PrismaModule`, `RedisModule`, `HealthModule`, `GiveawayModule`), остальное - при `GIVEAWAY_ONLY!==true`; в `env.validation.ts` при `GIVEAWAY_ONLY=true` снять требования `JWT_*`, `TWO_FACTOR_ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `COOKIE_DOMAIN`/`COOKIE_SECURE`; проверить, что `GiveawayModule` не зависит от выключаемых модулей (сейчас зависит от `PrismaModule` и `RedisModule`); `configure-app.ts` менять не нужно (парсеры тела и `trust proxy` общие).
- Обязательные переменные production, которые нужно задать заглушками: `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` (>= 16 символов), `TWO_FACTOR_ENCRYPTION_KEY` (>= 32), `TURNSTILE_SECRET_KEY` (любая непустая), `COOKIE_DOMAIN` (не localhost), `COOKIE_SECURE=true`, `TRUST_PROXY` (число hop-ов, здесь 1), `DATABASE_URL`. Плюс для розыгрыша: `GIVEAWAY_ENABLED=true`, `GIVEAWAY_MASTER_SECRET` (только владелец).

### Миграции

`prisma migrate deploy` применяет все 31 миграцию (в т.ч. не относящиеся к розыгрышу); выбрать только `20261119120000_giveaway_phase1` нельзя штатно, а модули, которые остаются в процессе (таймеры news, announcements, статус серверов, delivery), обращаются к своим таблицам каждую итерацию и без них пишут ошибки в лог. Вывод: ДОПУСТИМО применять все миграции, при условии что БД мини-выкладки - отдельная пустая БД на отдельном сервере/в отдельном томе (не production twomc.su): таблицы розыгрыша не имеют внешних ключей на остальные, две миграции с `INSERT` (настройки соцссылок и backfill прав отчётов) добавляют лишь служебные строки справочников. Команда (не выполнять до разрешения владельца): `docker compose -f giveaway/deploy/docker-compose.yml --profile ops run --rm migrate`. Перед этим убедиться, что `DATABASE_URL` указывает на БД `giveaway` из compose, а не на production. Seed не выполняется. Применяет миграции владелец или агент по его явной команде; деструктивные операции запрещены. Если после `GIVEAWAY_ONLY` остальные модули не поднимаются, достаточно будет одной миграции розыгрыша (вариант применяется через `prisma migrate deploy` на БД с одной выбранной миграцией - только после отдельного ревью).
