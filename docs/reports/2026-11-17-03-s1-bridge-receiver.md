# Этап 03, срез 1: приёмник Bridge (отчёт)

Ветка `feature/stage-03-s1-bridge-receiver`, не смержено. Основание: ADR-0182, риски R111-R120, `docs/stage-03/BRIDGE-CONTRACT.md`.

## Результат

Реализован приёмник Bridge v1 на стороне сайта: модуль, guard подписи и лимитов, приём `punishment.*` с дедупликацией и порядком, очистка журнала, CLI, симулятор плагина, fixtures, статический e2e. Миграция `20261117050000_bridge_core` (коммит 0b907ed, ранее) в этом шаге не менялась и нигде не применялась (ревью по Q28). e2e агентом не запускался.

## Коммиты

- cee9585: документы (ADR-0182 принят; контракт; R116-R120), шаг 0.
- e5cf587: крипто, константы, конфиг, env-валидация.
- b2a6c1b: схемы конверта, guard подписи, лимиты, Redis-сервис.
- c30e8d5: сервис приёма, источник наказаний, контроллер, модуль.
- c7e73f0: unit-тесты и вспомогательные средства (`apps/api/test/support/bridge-support.ts`).
- 4f973a7: очистка `bridge_event_log` раз в сутки, порог не меньше 7 суток.
- af6e066: CLI `bridge:register` и `bridge:print-key`, симулятор, fixtures.
- 9339d13: статический e2e `apps/api/test/bridge.e2e-spec.ts`.
- 0b907ed: миграция `20261117050000_bridge_core` (ранее, в этом шаге не менялась; для обязательного ревью).
- Коммит с CHANGELOG и этим отчётом: следующий за 9339d13 (хеш в ответе chief).

## Файлы

- `apps/api/src/modules/bridge/*` (config, constants, crypto, schema, capabilities, errors, redis, signature guard, rate-limit guard, ingest, punishment source, controller, retention, module, спеки).
- `apps/api/scripts/bridge-register-server.ts`, `bridge-print-key.ts`, `bridge-plugin-sim.ts`.
- `apps/api/test/support/bridge-support.ts`, `apps/api/test/fixtures/bridge/*.json`, `apps/api/test/bridge.e2e-spec.ts`.
- `docs/stage-03/BRIDGE-CONTRACT.md`, `docs/implementation/CHANGELOG.md`, этот отчёт.

## Проверки

- `tsc --noEmit -p apps/api/tsconfig.json`: 0 ошибок (tsconfig.json не исключает `test`, e2e входит в проверку типов).
- eslint и `prettier --check` для `apps/api/test/bridge.e2e-spec.ts`: без замечаний.
- jest `--runInBand src/modules/bridge src/modules/punishments` (финальный прогон после e2e-коммита, свободной ОЗУ было около 4 ГБ): 27 наборов, 940 тестов, все пройдены, 20.7 с.
- e2e, сборка, `pnpm install`: не запускались.

## Что прогнать chief

Файл `apps/api/test/bridge.e2e-spec.ts`. Команда как у существующих e2e (`apps/api/package.json`, `test:e2e`):
`pnpm --filter @twomc/api exec jest --config ./test/jest-e2e.json test/bridge.e2e-spec.ts` (из каталога `apps/api`: `npx jest --config ./test/jest-e2e.json bridge`). Окружение: одноразовая локальная БД с применёнными миграциями (включая `20261117050000_bridge_core`; миграция ждёт ревью), локальный Redis, `LITEBANS_ENABLED=false`. `BRIDGE_ENABLED=true` и синтетический мастер-секрет тест задаёт сам, значения из `.env*` не нужны. Тест создаёт серверы `e2e-<unique>-*` и строки зеркала `source='bridge'` и удаляет их в afterAll.

Покрыто: эталонный вектор; неверная подпись; просроченное время; повтор нонса; `server_mismatch`; подпись другого сервера под чужим key-id; отозванный и неизвестный сервер; 503 без секрета; повтор пачки (`duplicate`); параллельная пачка (одно применение); `conflict`; `stale`; 413; 422 (101 событие); 429 с `Retry-After` (всплеск 60 параллельных GET handshake на ключ); `created` и `updated` в зеркало через `PunishmentSource`; отсутствие секретов, подписей, нонсов, IP и данных событий в логах и журнале.

## Допущения

- В приложении пока нет подписчика синхронизатора этапа 02 на `BridgePunishmentSource`; e2e подписывается сам и пишет в зеркало через `PrismaPunishmentMirrorStore.applyBatch`. В боевом режиме без подписчика приёмник отвечает 503.
- В симуляторе реализован только режим `scenario`; команды hello, punishment, player, flood, snapshot из раздела 8 контракта не сделаны.
- Метрика возраста применения - поле планировщика очистки и строка лога, отдельного экспортёра метрик нет.
- Журнал `bridge_event_log` хранит только принятые события `punishment.*` (hello, overflow и отказы не пишутся); `data` не хранится.
- Тест 429 опирается на всплеск 60 одновременных запросов внутри одной секунды при лимите 30 на всплеск; на очень медленной машине возможна нестабильность (при необходимости уменьшить лимит или увеличить число запросов).
- Сценарии `punishment.removed` и `punishment.deleted` в e2e не включены (юнит-тесты есть); сверка snapshot (раздел 6) и нагрузка (пункт 7 плана) - срез 2.

## Риски

- Миграция `20261117050000_bridge_core` не применена нигде; без неё на локальной БД e2e не пройдёт.
- Redis без AOF: после сброса окно повтора нонса до 60 с (раздел 2.3, п. 8; вопрос 3 раздела 12 контракта).
- Приёмник ничего не делает в зеркале без подписчика синхронизатора (503 вместо ложного `accepted`).

## Блокеры

Нет (e2e и миграция - действия chief и владельца по правилам Q28).

## Вопросы владельцу

Нет.
