# Отчёт: аудит прав персонала и admin-2FA (Q11), этап 00

Дата: 2026-11-17 · Промпт: `docs/agent-prompts/07-NIGHT-RUN.md` v1.0 (ответ владельца на Q11) · Режим: read-only · Код: worktree stage00, ветка `fix/q9-ipv6-64-rate-limit` (0b926d5).
Исполнители: Quality & Security Director → Security Lead (аудит) + QA Lead (независимая выборочная перепроверка). Отчёт составлен twomc-chief по их результатам.

## 1. Результат

Аудит выполнен. Подтверждены 1 High и 2 Medium находки; NODE_ENV при незаданном значении работает как fail-open. High (F1) и fail-closed NODE_ENV переданы на исправление (ветка `fix/q11-staff-hierarchy-node-env`, отчёт `2026-11-17-00-q11-fixes.md`). Продуктовые решения (F2, F3, политика 2FA) — вопросы владельцу Q22–Q24.

## 2. Метод и покрытие

- grep по `RequirePermission|PermissionsGuard|AdminTwoFactor|requireAdminTwoFactor|assertAdmin2fa|isAdmin2faDenied|canActOn|hasPermission(|NODE_ENV|process.env`, мутации без `@RequirePermissions`.
- 51 файл с декораторами/guard, 44 контроллера, 264 декоратора `@RequirePermissions`; 3 WS-гейтвея (`chat`, `direct-messages`, `notifications`), staff-события только в chat.
- Отклонение: построчная карта хендлеров не составлена — карта по модулям (ниже).

## 3. Карта (сжато)

- Глобальный `PermissionsGuard` (`roles/guards/permissions.guard.ts:97-143`) вызывает `assertAdmin2fa` для любого хендлера с `@RequirePermissions` — фактическая admin-2FA шире закрытого списка ADR-0156.
- WS chat: явная admin-2FA на `delete_message` (модераторская ветка), `pin_message`, `mute_user`, `ban_user`; HTTP `GET communications/recipients` — ручная проверка без декоратора.
- 23 контроллера с мутациями без `@RequirePermissions` (auth, profiles, comments, cart, orders, friends и др.) — пользовательские действия; staff-действий без server-side права среди прочитанных не найдено.

## 4. Находки

| # | Severity | Суть | Где | Статус |
|---|---|---|---|---|
| F1 | High (QA: подтверждено) | Chat mute/ban без проверки иерархии, SYSTEM и self — модератор может заглушить/забанить администратора, владельца, SYSTEM или себя | `chat/chat.gateway.ts:355-369, 391-405`; `chat/moderation.service.ts:44-47, 80-83` | исправляется |
| F2 | Medium (подтверждено) | Флаг `requireAdmin2fa` меняется обычным правом `settings.site.edit`, с `@SkipAudit()`; кэш 15 с | `admin/dto/update-site-settings.dto.ts:124`, `admin-panel.controller.ts:184-186` | Q22 |
| F3 | Medium (частично) | Выдача роли проверяет приоритет и `canActOn`, но не то, что права роли ⊆ прав выдающего | `roles/user-roles.controller.ts:61-75` | Q23 |
| F4 | Low | Тикет ADR-0156 про `users.access_level.edit_self` не подтвердился как дыра (чужое — `canActOn`, своё — отдельное право, 2FA — общий guard) | `users.controller.ts:142` | закрыт |
| F5 | Low | `GET communications/recipients` без `@RequirePermissions` (ручная проверка) | communications | к сведению |
| N1 | High (дизайн) | Незаданный `NODE_ENV` → Joi default `development` → все проверки `=== 'production'` выключены (env-валидация, admin-2FA без ключа, test-OTP, CORS, debug-лог кодов писем) | `config/env.validation.ts`, `permissions.guard.ts:50-52,113`, `auth/test-otp.ts:21`, `config/cors.ts:49`, `email/email.service.ts:41,48` | исправляется (решение владельца: пусто = production) |

## 5. Проверки

- Read-only grep и чтение кода; тесты не запускались. QA-перепроверка: F1, F2 подтверждены; F3 и NODE_ENV — частично (формулировки уточнены); 5 мест NODE_ENV сверены.

## 6. Риски и непокрытое

- Не проверены на иерархию/IDOR: store-admin (рубины, возвраты), `punishments`, `quick-moderation`, `admin-users-bulk`, `export`, `achievements`, `awards`, `forms`, `events`, `news`, `site-module.guard`; WS `direct-messages`, `notifications`; HTTP-модерация чата вне `modules/chat`. Возможны находки класса F1 — рекомендован второй проход (Q11b).
- Влияние 15-секундного кэша `requireAdmin2fa` на открытые WS-сессии не оценено.

## 7. Допущения

- Допущение: swagger/debug-эндпоинтов и stack trace в ответах нет (grep не нашёл).
- Допущение: F2/F3 — продуктовые решения (какие действия требуют отдельного права/2FA), без команды не исправляются.

## 8. Решения владельца

Q22 (F2), Q23 (F3), Q24 (политика 2FA и step-up), см. `docs/reports/QUESTIONS-FOR-OWNER.md`.
