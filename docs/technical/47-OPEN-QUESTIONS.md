# 47 — Открытые вопросы

1. Какие endpoints с `@Roles(HELPER|MODERATOR)` (33 шт.) должны получить права при миграции — нужны решения владельца по набору permissions для ролей ниже superuser.
2. Нужно ли оставлять 5 позиций группы OWNER (`Senior Curator`, `Curator`, `Head PR Manager`, `Chief Technical Administrator`, `Head Developer`) с текущим полным доступом на время миграции.
3. `/dashboard/*` (OWNER) и `/admin/*` (ADMIN) частично дублируют страницы (store stats, loyalty, currencies, audit-log) — какие остаются.
4. Включать ли DENY сразу (10-RBAC-PERMISSIONS.md, B.3).
5. Выбор CDN-хранилища (S3-совместимое / nginx+диск) и политика хранения оригиналов.
6. Выбор платёжного провайдера.
7. Содержимое `BAN_SYSTEM_TODO.md` не разобрано; связь с `User.isBanned`/`UserPunishment` неясна.
8. Аккаунт `#3` — нужен ли в production seed (по условию задачи не обязателен).
9. Должен ли `#0` существовать как реальная запись `User` с `shortId = 0` (рекомендация) или как системная константа.
