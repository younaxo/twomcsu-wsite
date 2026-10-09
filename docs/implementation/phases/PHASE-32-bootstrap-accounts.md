# PHASE 32 — Initial accounts (bootstrap #0/#1/#2 из ENV)

Статус: **готово** (ветка `feature/home-shell-v2`). Реализация ADR-0006 /
44-TARGET-ARCHITECTURE §5.

## Что сделано

- `apps/api/prisma/seed/bootstrap.ts` — `seedBootstrapAccounts()` вызывается из
  `prisma/seed/index.ts` после permissions/позиций/superuser-ролей:
  - `#0` SYSTEM — `accountType=SYSTEM`, `shortId=0` (явная вставка), заведомо
    невалидный hash пароля; вход по паролю дополнительно отвергается в
    `AuthService.login` по `accountType` (401, как «неверный пароль»);
  - `#1` Owner — роль `owner`; username/email **только из env**
    (`BOOTSTRAP_OWNER_USERNAME`, `BOOTSTRAP_OWNER_EMAIL`), иначе пропускается;
  - `#2` Chief Curator — роль `chief-curator`; по умолчанию `younaxo_` /
    `younaxo@icloud.com` (данные владельца), переопределяется env.
  - Пароли — только `BOOTSTRAP_*_PASSWORD`. Без пароля аккаунт не создаётся:
    development — предупреждение в логе seed, production — ошибка seed.
  - `mustChangePassword=true` для #1/#2 (сбрасывается при смене пароля).
  - Идемпотентно: повторный seed обновляет пароль/роль существующего аккаунта
    (по e-mail). Если `shortId` уже занят другим пользователем — явная ошибка.
  - После вставки sequence `users.shortId` выравнивается (`setval`), чтобы
    регистрация не получила занятый номер.
- `.env.example` — ключи идентичности #1/#2 задокументированы.

## Локальный dev-доступ (тестовый вход younaxo)

Пароль **не хранится** в git/README/документации: он лежит только в локальном
`.env` (gitignored) в `BOOTSTRAP_CHIEF_CURATOR_PASSWORD`. Шаги:

```bash
# 1. в .env задать BOOTSTRAP_SYSTEM_PASSWORD и BOOTSTRAP_CHIEF_CURATOR_PASSWORD
# 2. создать/обновить аккаунты
pnpm db:seed
# 3. войти на http://localhost:3000/login — логин younaxo_ (или e-mail), пароль из .env
```

Проверено: `/auth/login` → 200, `/auth/me` → `#2`, tag `younaxo_#0002`, роль
`chief-curator` (superuser), префикс `chief-curator.png` с CDN в меню профиля;
`system` → 401.

## Сопутствующий security-фикс (ADR-0057)

`PrismaService` создаётся с `omit: { user: { password: true } }` — хеш пароля
больше не попадает ни в один ответ (`include: { author: true }` в новостях,
событиях, DM и т.д. ранее возвращал полный `User`). В `login` и
`changePassword` поле запрашивается явно (`omit: { password: false }`).

## Не сделано / отложено

- Staff-роли уровня Admin/Moderator/Helper (ADR-0005) — отдельная задача,
  когда определится набор permissions для них.
- Принудительная смена пароля на frontend при `mustChangePassword=true` —
  вместе со страницей «Безопасность» (PHASE 31).
