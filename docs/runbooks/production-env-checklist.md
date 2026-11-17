# Runbook: чек-лист production-переменных

Решение: ADR-0161 (Proposed), ранее ADR-0156 (cookie, 2FA), ADR-0154 (Turnstile). Деплой: `docs/runbooks/deploy.md`.
В документе только имена переменных и требования. Реальные значения в репозиторий, чаты, тикеты и логи не попадают.
Правку `.env` на сервере и деплой выполняет владелец или назначенный им человек; агенты их не запускают.
2FA персонала обязательна всегда (ADR-0169): аварийный доступ при потере устройства и резервных кодов — `docs/runbooks/owner-emergency-access.md`.

## Таблица переменных

| Переменная                                | Требование                                                                                                                                 | Что будет при нарушении                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`          | Публичный site key Turnstile. Проверяется при сборке web (P3-04, ADR-0154). Старое имя `HCAPTCHA` больше не читается                       | `docker compose config` и сборка web падают с сообщением «Укажите NEXT_PUBLIC_TURNSTILE_SITE_KEY»                                       |
| `NODE_ENV`                                | `production` (пустое или не заданное значение тоже считается production; `staging`, `Production` и другие значения роняют старт, ADR-0164) | Схема принимает только `development`, `test`, `production` или пусто; всё кроме явных `development`/`test` включает production-проверки |
| `TURNSTILE_SECRET_KEY`                    | Секретный ключ Turnstile, непустой                                                                                                         | API не стартует: «TURNSTILE_SECRET_KEY обязателен в production»                                                                         |
| `TURNSTILE_DISABLED`                      | Не задавать вообще                                                                                                                         | API не стартует: «TURNSTILE_DISABLED запрещён в production»                                                                             |
| `TRUST_PROXY`                             | `1` (число доверенных прокси-хопов, nginx -> api), непустое                                                                                | compose падает без значения; API не стартует: «TRUST_PROXY обязателен в production (...)»                                               |
| `COOKIE_SECURE`                           | `true`                                                                                                                                     | API не стартует: «COOKIE_SECURE=true обязателен в production»                                                                           |
| `COOKIE_DOMAIN`                           | `.twomc.su` (не localhost)                                                                                                                 | API не стартует: «COOKIE_DOMAIN обязателен в production» или «не может быть localhost»                                                  |
| `TWO_FACTOR_ENCRYPTION_KEY`               | Не короче 32 символов, генерирует владелец (см. ниже)                                                                                      | API не стартует: «TWO_FACTOR_ENCRYPTION_KEY обязателен в production» или «не короче 32 символов»                                        |
| `DATABASE_URL`                            | Строка подключения к PostgreSQL                                                                                                            | API не стартует (обязательна всегда)                                                                                                    |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Не короче 16 символов (рекомендуется: разные значения, схема это не проверяет)                                                             | API не стартует (обязательны всегда)                                                                                                    |
| `AUTH_TEST_OTP_ENABLED`                   | Не включать (не задавать или `false`)                                                                                                      | API не стартует: «AUTH_TEST_OTP_ENABLED запрещён в production»                                                                          |

## TWO_FACTOR_ENCRYPTION_KEY

- Генерирует владелец у себя, например `openssl rand -base64 48`.
- НИКОГДА не вставлять в чат, тикеты, репозиторий, логи и вывод агентов.
- Бэкап ключа хранится в менеджере паролей владельца.
- Смена ключа ломает уже включённую 2FA: менять только вместе со сбросом 2FA у пользователей.

## R31: 2FA персонала до выкладки релиза

До выкладки релиза с обязательной 2FA (ADR-0169, риск R31) каждому сотруднику и владельцу нужно включить 2FA в «Настройки → Безопасность» и сохранить резервные коды офлайн. Иначе после выкладки при заданном `TWO_FACTOR_ENCRYPTION_KEY` их действия по праву (в том числе чтение чужих обращений и загрузка файлов персоналом) получат отказ 403 `admin_2fa_required`. Войти и включить 2FA сотрудник может и после выкладки сам. Аварийный доступ: `docs/runbooks/owner-emergency-access.md`.

## Как проверить до деплоя

1. На сервере сверить `.env` с таблицей выше (значения не копировать и не показывать).
2. Проверить compose: `docker compose --env-file .env -f infrastructure/docker-compose.prod.yml config -q`.
   - Без `TRUST_PROXY` команда падает (fail-fast).
   - Без `NEXT_PUBLIC_TURNSTILE_SITE_KEY` тоже падает.
   - Для проверки без реального `.env` использовать файл с dummy-значениями вне репозитория.
3. Деплой по `docs/runbooks/deploy.md`; после старта проверить `/health` и логи api: `docker compose ... logs --tail=200 api`.

## Сообщения fail-fast API и что делать

| Сообщение                                                                 | Действие                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| TRUST_PROXY обязателен в production (...)                                 | Задать `TRUST_PROXY=1` в `.env`, перезапустить api           |
| TURNSTILE_SECRET_KEY обязателен в production                              | Завести Turnstile в Cloudflare, записать secret key в `.env` |
| TURNSTILE_DISABLED запрещён в production                                  | Удалить `TURNSTILE_DISABLED` из `.env`                       |
| COOKIE_SECURE=true обязателен в production                                | Задать `COOKIE_SECURE=true`                                  |
| COOKIE_DOMAIN обязателен в production / не может быть localhost           | Задать `COOKIE_DOMAIN=.twomc.su`                             |
| TWO_FACTOR_ENCRYPTION_KEY обязателен в production / не короче 32 символов | Владелец генерирует ключ локально и записывает в `.env`      |
| AUTH_TEST_OTP_ENABLED запрещён в production                               | Удалить или поставить `false`                                |

После деплоя с ошибкой старта сработает автооткат образов (см. `docs/runbooks/deploy.md`): исправить `.env` и повторить деплой.

## Владельцу: миграция и права обращений (Q26, Q27, ADR-0172)

1. Применить на production миграцию `20261017000000_report_status_changed` (`ALTER TYPE "NotificationType" ADD VALUE 'REPORT_STATUS_CHANGED'`) до деплоя кода, который шлёт этот тип. Миграции на production применяет только владелец.
2. Запустить seed синхронизации каталога прав (таблица `permissions` получит `reports.notes.edit` и `reports.notes.unpin`).
3. В админке выдать нужным ролям `reports.notes.edit` (правка чужих заметок, раньше `reports.delete`) и `reports.notes.unpin` (открепление, раньше `reports.notes.pin`). Без этого персонал не сможет править чужие заметки и откреплять.

### Порядок выкладки и проверки (Q26, Q27, ADR-0172)

Порядок строго такой: миграция -> seed каталога прав -> выдача прав ролям -> деплой кода.

- Если код выложен до миграции, смена статуса не падает, но уведомление `REPORT_STATUS_CHANGED` автору теряется молча (ошибка ловится и пишется предупреждением в лог).
- После деплоя проверить логи api на строку «Не удалось отправить уведомление»: её появление означает, что уведомления не доходят (миграция не применена или иная ошибка записи).
- Открепление заметки: только `DELETE .../notes/:noteId/pin` под правом `reports.notes.unpin`; `PATCH .../pin` только закрепляет (`pinned:false` -> 400). Старый web-клиент, откреплявший через PATCH, до обновления получит 400.

Сверка версии PostgreSQL (`ALTER TYPE ... ADD VALUE` внутри транзакции требует PostgreSQL 12+): в `infrastructure/docker-compose.prod.yml` сервис `postgres` использует образ `postgres:16-alpine`, то есть мажорная версия 16 (>= 12), требование выполнено. Это сверка по файлу compose; фактическую версию запущенного сервера на production она не заменяет (`SELECT version();` проверяет владелец).
