# Runbook: чек-лист production-переменных

Решение: ADR-0161 (Proposed), ранее ADR-0156 (cookie, 2FA), ADR-0154 (Turnstile). Деплой: `docs/runbooks/deploy.md`.
В документе только имена переменных и требования. Реальные значения в репозиторий, чаты, тикеты и логи не попадают.
Правку `.env` на сервере и деплой выполняет владелец или назначенный им человек; агенты их не запускают.

## Таблица переменных

| Переменная                                | Требование                                                                                                           | Что будет при нарушении                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`          | Публичный site key Turnstile. Проверяется при сборке web (P3-04, ADR-0154). Старое имя `HCAPTCHA` больше не читается | `docker compose config` и сборка web падают с сообщением «Укажите NEXT_PUBLIC_TURNSTILE_SITE_KEY» |
| `NODE_ENV`                                | `production` (пустое или не заданное значение тоже считается production, ADR-0164)                                   | Любое значение кроме явных `development`/`test` включает production-проверки                      |
| `TURNSTILE_SECRET_KEY`                    | Секретный ключ Turnstile, непустой                                                                                   | API не стартует: «TURNSTILE_SECRET_KEY обязателен в production»                                   |
| `TURNSTILE_DISABLED`                      | Не задавать вообще                                                                                                   | API не стартует: «TURNSTILE_DISABLED запрещён в production»                                       |
| `TRUST_PROXY`                             | `1` (число доверенных прокси-хопов, nginx -> api), непустое                                                          | compose падает без значения; API не стартует: «TRUST_PROXY обязателен в production (...)»         |
| `COOKIE_SECURE`                           | `true`                                                                                                               | API не стартует: «COOKIE_SECURE=true обязателен в production»                                     |
| `COOKIE_DOMAIN`                           | `.twomc.su` (не localhost)                                                                                           | API не стартует: «COOKIE_DOMAIN обязателен в production» или «не может быть localhost»            |
| `TWO_FACTOR_ENCRYPTION_KEY`               | Не короче 32 символов, генерирует владелец (см. ниже)                                                                | API не стартует: «TWO_FACTOR_ENCRYPTION_KEY обязателен в production» или «не короче 32 символов»  |
| `DATABASE_URL`                            | Строка подключения к PostgreSQL                                                                                      | API не стартует (обязательна всегда)                                                              |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Не короче 16 символов (рекомендуется: разные значения, схема это не проверяет)                                       | API не стартует (обязательны всегда)                                                              |
| `AUTH_TEST_OTP_ENABLED`                   | Не включать (не задавать или `false`)                                                                                | API не стартует: «AUTH_TEST_OTP_ENABLED запрещён в production»                                    |

## TWO_FACTOR_ENCRYPTION_KEY

- Генерирует владелец у себя, например `openssl rand -base64 48`.
- НИКОГДА не вставлять в чат, тикеты, репозиторий, логи и вывод агентов.
- Бэкап ключа хранится в менеджере паролей владельца.
- Смена ключа ломает уже включённую 2FA: менять только вместе со сбросом 2FA у пользователей.

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
