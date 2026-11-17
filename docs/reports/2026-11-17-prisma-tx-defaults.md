# Транзакции Prisma: общие maxWait/timeout и 503 busy (ADR-0183)

Дата: 2026-11-17. Ветка `fix/prisma-tx-defaults`. Миграций нет, `package.json` и lockfile не менялись.

## Проблема

Prisma по умолчанию: `maxWait` 2000 мс (старт транзакции), `timeout` 5000 мс. Под нагрузкой `P2028` превращался в 500. Три случая: формы (точечный `maxWait`), вебхук оплаты заказа (точечные значения), e2e голосования «параллельные голоса — одна награда» (500 `P2028`).

## Решение

| Параметр | По умолчанию | Границы | Обоснование |
| --- | --- | --- | --- |
| `PRISMA_TX_MAX_WAIT_MS` | 10000 | 1000-30000 | Равно `pool_timeout` Prisma (10 с) и уже проверенным значениям форм и заказов; ниже 60 с nginx; нижняя граница не даёт выключить ожидание |
| `PRISMA_TX_TIMEOUT_MS` | 10000 | 1000-60000 | Транзакции под advisory lock ждут очереди; 10 с покрывают очередь из десятков коротких транзакций; верхняя граница ниже 60 с прокси |
| `connection_limit` (рекомендация владельцу) | 15 | - | Один экземпляр API, Postgres `max_connections=100`; запас на бэкап, миграции, вложенные запросы Bridge |
| `pool_timeout` (рекомендация владельцу) | 10 с | - | Совпадает с умолчанием Prisma и `maxWait` |

Пул в скриптах прогона e2e: `e2e-guarded.sh` и `e2e-local.sh` задают только `DATABASE_URL=postgresql://twomc:ci_password@localhost:55432/<БД>` без `connection_limit` и `pool_timeout`: пул Prisma = число CPU x 2 + 1, `pool_timeout` 10 с. Скрипты не менялись. Production: `infrastructure/docker-compose.prod.yml` - один контейнер API (768 МБ), Postgres 16 с `max_connections=100`, `shared_buffers=256MB`; `DATABASE_URL` берётся из `.env` (не читался), параметров пула в репозитории нет. Рекомендация записана в `docs/runbooks/production-env-checklist.md`.

Точечные опции:
- убраны (совпадали с общими): `forms.service.ts` (отправка формы), `orders.service.ts` (вебхук оплаты, только опции, логика не менялась);
- оставлены: Bridge `TX_OPTIONS` 2000/6000 и зеркало наказаний `APPLY_TX_*` 2000/6000 (быстрый отказ намеренный, R121/F4); инвентарь - явные 2000/5000 (прежние умолчания Prisma) и Serializable: при повторе до 4 раз общие 10/10 с дали бы до 80 с.

## Фильтр ошибок

`apps/api/src/common/filters/prisma-exception.filter.ts`, подключён через `APP_FILTER` в `PrismaModule`.

| Код Prisma | Ответ | Retry-After |
| --- | --- | --- |
| P2028 (транзакция не стартовала или истекла) | 503 `{ statusCode, code: 'busy', message }` | 2 |
| P2024 (нет соединения в пуле за `pool_timeout`) | 503 `busy` | 2 |
| P2034 (конфликт записи, взаимоблокировка) | 503 `busy` | 1 |
| `/bridge/v1`, те же коды | 503 `{ error: 'unavailable' }` | 5 |
| любые другие `PrismaClientKnownRequestError` | 500 `Internal server error`, без деталей, с логом | - |

Текст ошибки и `meta` клиенту не отдаются. Другие классы ошибок Prisma (`PrismaClientInitializationError`, `PrismaClientUnknownRequestError`, `PrismaClientValidationError`) не затронуты - обрабатываются стандартным обработчиком Nest (500).

## Инвентаризация интерактивных транзакций

«Сейчас» - до изменений: P2028/P2024/P2034 не обрабатывался нигде (кроме инвентаря), клиент получал 500. «Должно» - после ADR-0183 (общий 503 busy, где не сказано иное).

| Файл:строка | Сценарий | Сейчас | По ADR |
| --- | --- | --- | --- |
| voting/voting.service.ts:73 | вебхук голосования, advisory lock по игроку | 500 (P2028); P2002 externalId -> 200 duplicate | 503 busy; duplicate сохраняется |
| forms/forms.service.ts:282 | отправка формы, advisory lock формы | 500; `maxWait` 10 с точечно | 503 busy; общие опции |
| store/orders.service.ts:348 | вебхук оплаты, PENDING -> COMPLETED + промокод | 500; точечные 10/10 с | 503 busy (провайдер ретраит); общие опции; логика не менялась |
| bridge/bridge-ingest.service.ts:191 | шаг 1 приёма события, журнал `received` | контроллер (`bridge.controller.ts:106-111`) уже отвечал 503 `unavailable`, `Retry-After: 5` | без изменения для пути контроллера; фильтр даёт ту же форму для кодов Prisma вне контроллера; 2000/6000 оставлены |
| punishments/prisma-punishment-mirror.store.ts:130 | запись зеркала наказаний | ошибка пробрасывается; опрос/Bridge ретраят | без изменения; 2000/6000 оставлены |
| inventory/prisma-inventory.store.ts:51 | запись инвентаря, Serializable | P2034/P2002 повтор до 4, затем 500 | после повторов 503 busy; явные 2000/5000 |
| moderation/quick-moderation.service.ts:107 | быстрый бан, условный UPDATE + аудит | 500 | 503 busy |
| moderation/quick-moderation.service.ts:163 | снятие бана + аудит | 500 | 503 busy |
| profiles/profiles.service.ts:701 | заявка на бейдж медиа, advisory lock | 500 | 503 busy |
| punishments/punishments-issuer-hide.service.ts:116 | скрытие выдавшего + аудит | 500 | 503 busy |
| reports/reports-admin.service.ts:160 | снятие report-бана | 500 | 503 busy |
| reports/reports-admin.service.ts:225 | деактивация банов + аудит | 500 | 503 busy |
| reports/reports.service.ts:428 | обжалование под блокировкой | 500 | 503 busy |
| users/media-requests.controller.ts:53 | решение по заявке на бейдж | 500 | 503 busy |

Неинтерактивные `$transaction([...])` (пакеты операций, один round-trip; `maxWait`/`timeout` не применяются, возможны P2024 и P2034): achievements (2), admin-tools, site-social-links, auth (1), two-factor (3), user-departments, direct-messages (2), forms/form-responses, friends, news-admin, news (5), role-bulk, roles.controller, user-roles (2), storage-retention (2), topics-admin. Сейчас 500, по ADR 503 busy через общий фильтр.

Специфичная обработка (duplicate, 429) не потребовалась: единственный «duplicate» (voting P2002) уже есть. Повтор P2034 на сервере - только инвентарь (R142).

## Проверки

Юнит-тесты (фильтр, `PrismaService`, хранилище инвентаря, Joi) - в итоге агента и `docs/implementation/CHANGELOG.md`.

e2e исчерпания пула НЕ доказан. Попытка `test/prisma-busy.e2e-spec.ts` падала с pool timeout при старте приложения; файл удалён из ветки. Маппинг кодов в 503 подтверждён только юнит-тестами фильтра. Дизайн повторной попытки (отдельная задача после разрешения владельца на прогон e2e): `pool_timeout=20` как в `bridge.e2e-spec.ts:626`; проверять путь P2028 на транзакционном запросе вебхука голосования или формы; удерживать `POOL_SIZE-1` соединений заложниками; учесть фоновые планировщики. Фоновый e2e «параллельные голоса» (ADR-0121) этой веткой не перепроверялся.

## Допущения

- 503 для P2034 вместо 409: конфликт записи - сбой сервера, транзакция откатана, клиент может повторить.
- Для `/bridge/v1` фильтр повторяет форму ответа контракта (`{ error: 'unavailable' }`, Retry-After 5).
- `PrismaService` принимает `ConfigService` как `@Optional()`; без него читает `process.env` (юнит-тесты, CLI).

## Вопросы владельцу

1. `connection_limit=15&pool_timeout=10` в production `DATABASE_URL`? Рекомендация: да.
2. Оставить `PRISMA_TX_*` по умолчанию 10000/10000? Рекомендация: да до нагрузочной проверки (R140).
