# 44 — Целевая архитектура

Здесь описано желаемое состояние; **код не менялся**.
1. **Dynamic permissions + Discord-style roles** — модели `Role/Permission/RolePermission/UserRole/RoleAssignmentLog`, алгоритм effective permissions, priority-иерархия, superuser только `Owner`, `Chief Curator`, `Chief Developer` через единственный `PermissionService.isSuperuser` (10-RBAC-PERMISSIONS.md, B).
2. **Централизованная авторизация** — `@RequirePermissions('x.y')` + `PermissionsGuard` на каждом staff-endpoint (реестр 11-PERMISSION-MATRIX.md), `@Roles` удаляется; frontend-меню строится из permissions (endpoint `GET /auth/me` возвращает effective permissions).
3. **Мгновенный отзыв доступа** — JWT только `sub`; permissions/бан проверяются по Redis-кешу `perm:user:{id}` с немедленным `DEL` при изменении ролей; бан → `revokeAllSessions`.
4. **CDN + AVIF** — `cdn-files.twomc.su`, ключи в БД, `CDN_BASE_URL`, модель `File`, pipeline sharp → AVIF (26-CDN-FILES.md, B).
5. **Secure bootstrap** — аккаунты `#0` (SYSTEM), `#1` (Owner), `#2` (Chief Curator) создаются seed только из `BOOTSTRAP_*_PASSWORD`; хеш существующим bcrypt(12); без ENV — не создаются; `mustChangePassword=true`. `#0`: `accountType=SYSTEM`, вход по паролю запрещён (пустой/невалидный hash + проверка в `login`), защита от delete/ban/rename/удаления роли; используется как actor для системного audit, уведомлений и автоматических наград. Реализация `shortId=0`: явная вставка `shortId = 0` (Postgres допускает 0 в `Int`), sequence остаётся ≥ 1; FK не затрагиваются (`id` — cuid). `#3` (`dizikk`, Senior Curator) в bootstrap **не входит**.
6. **Audit** — обязательные действия из 25-AUDIT-LOG.md, запись в транзакции мутации.
7. **Нормализованные API/ошибки** — единый `ExceptionFilter`: `{ statusCode, code, message, details, requestId }`; сохранить обратную совместимость `message`.
8. **Инвалидация кеша** — обязательна после profile/role/permission/news/store/server update; централизованный `CacheInvalidator` с тегами/паттернами.
9. **Платежи** — реальный провайдер + вебхук; удалить `mock-complete`.
10. **Инфраструктура** — Dockerfile api/web, CI (lint, typecheck, test, prisma validate), `trust proxy`, Redis-storage для throttler, distributed lock для cron.
