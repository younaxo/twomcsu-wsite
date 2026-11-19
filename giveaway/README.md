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
- Очередь: `plugins/TwoMCGiveaway/queue.log` (переживает рестарт), событие удаляется только после 2xx. Сеть, 401, 403, 429, 5xx, прочее — повтор с экспоненциальной задержкой (10 с … 15 мин, ±20%, `Retry-After` учитывается). 400, 413 и 422 — пакет переносится в `dead-letter.log` без повтора. События старше 72 ч (с запасом 5 мин) отбрасываются локально.
- Ники не по `^[A-Za-z0-9_]{1,16}$` (например Bedrock через Floodgate) пропускаются, иначе сайт отклонил бы весь пакет; счётчик виден в `/giveawaytime`.

Настройка `plugins/TwoMCGiveaway/config.yml`: `apiUrl` (адрес сайта без пути, `https`; `http` только для localhost), `serverId`, `keyVersion`, `keyFile`, `afkMinutes`, `maxQueueEvents`. Переопределение окружением: `GIVEAWAY_API_URL`, `GIVEAWAY_SERVER_ID`, `GIVEAWAY_KEY_VERSION`, `GIVEAWAY_KEY_FILE`. Сам ключ (64 hex-символа, файл из утилиты бэкенда) лежит в отдельном файле вне репозитория и вне config.yml и в логи не попадает. Без URL, `serverId` или ключа плагин не отправляет и пишет одно предупреждение; события копятся в очереди и уйдут после настройки и перезапуска.

Команда `/giveawaytime` (право `giveaway.admin`, по умолчанию op): настроена ли отправка, режим online-mode, размер и возраст очереди, последний успех, ошибка связи и время следующей попытки, счётчики отброшенных событий. Ключ не показывается.

Безопасность: при `online-mode=false` в лог пишется громкое предупреждение (риск подмены ника, см. ADR). За прокси нужен `online-mode=true` на прокси и защищённый проброс UUID. Часы сервера должны быть синхронизированы по NTP (окно ±300 с).
