# 45 — План миграции

Порядок учитывает риски из 29-SECURITY.md: сначала закрываются CRITICAL, затем RBAC.

| Phase | Objective | Files / areas | Migrations | Breaking changes | Rollback | Tests |
|---|---|---|---|---|---|---|
| 0 | Hotfix безопасности | `seed.ts`, `orders.controller.ts`/`orders.service.ts`, `auth.service.ts`, `admin-users.service.ts`, `main.ts` (`trust proxy`) | — | seed без ENV падает; mock-оплата отключена в prod | revert коммита | seed без ENV не создаёт аккаунты; `mock-complete` → 404/403 в prod; бан → `refresh` 401 |
| 1 | Documentation baseline | `docs/technical/**` | — | — | — | coverage report |
| 2 | Permissions schema | `schema.prisma`: Role, Permission, RolePermission, UserRole, RoleAssignmentLog; seed реестра 11-PERMISSION-MATRIX.md | `add_rbac_tables` (аддитивная) | нет | drop новых таблиц | seed идемпотентен |
| 3 | Authorization guard | `PermissionService`, `PermissionsGuard`, `@RequirePermissions`; dual-mode: `@Roles` продолжает работать | — | нет | отключить guard | 403/200/superuser/priority (46-TESTING.md) |
| 4 | Миграция controllers | 186 staff-endpoints → `@RequirePermissions`; роли-эквиваленты текущим группам | data-migration: `User.roleGroup`+`Position` → `UserRole` | нет (поведение эквивалентно) | вернуть `@Roles` | матрица endpoint×роль |
| 5 | Role editor API | `/admin/roles*`, `/admin/users/:id/roles*`, history | — | — | — | privilege escalation |
| 6 | Role editor frontend + меню из permissions | `admin/layout.tsx`, `useRoleGuard` → `usePermissions` | — | меню зависит от permissions | feature-flag | e2e видимость разделов |
| 7 | Bootstrap accounts | seed `BOOTSTRAP_*`, `accountType`, `mustChangePassword`, `#0` | `add_account_type` | seed требует ENV | — | seed в prod без ENV |
| 8 | CDN storage + модель `File` | `UploadsService` → `StorageService` (local/S3), `CDN_BASE_URL`, миграция путей `/uploads/..` → ключи | `add_files` | формат значения полей-ссылок | оставить local driver | upload/delete/orphan |
| 9 | AVIF pipeline | `ImagePipeline` (sharp avif, пресеты, GIF/SVG-правила) | — | новые файлы `.avif` | вернуть webp | MIME spoofing, animated GIF, SVG sanitize |
| 10 | Audit coverage + error format | 186 мутаций, `ExceptionFilter` | — | формат ошибок (+поля) | — | аудит на каждую мутацию |
| 11 | Cleanup legacy RBAC | удалить `RoleGroup` из `RolesGuard`, JWT payload, `User.roleGroup` | `drop_role_group` | все клиенты используют permissions | восстановить из бэкапа | регресс |
