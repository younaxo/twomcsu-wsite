# Q52: права на удаление заметок обращений (ADR-0176)

Ветка fix/q52-delete-notes-perms (от 886ff98), не смержена.

## Решение владельца

Удаление чужой заметки только с `reports.notes.edit`; чужую закреплённую удаляет тот, у кого есть и `reports.notes.edit`, и `reports.notes.unpin`.

## Изменения

- `apps/api/src/modules/reports/reports-moderation.service.ts`: `deleteModeratorNote` принимает `actorId`; своя заметка без проверки прав; чужая требует edit; чужая закреплённая требует edit и unpin; иначе `ForbiddenException` (403).
- `apps/api/src/modules/reports/reports-moderation.controller.ts`: передаёт `user.id`.
- `apps/api/src/modules/reports/reports-moderation.service.spec.ts`: 6 unit-тестов (своя закреплённая; чужая без права; с edit; закреплённая с edit без unpin; только unpin без edit; с обоими правами).
- e2e `reports.e2e-spec.ts`: удаление выполняет автор заметки (moderator), поведение не меняется; правок не потребовалось, e2e не запускались.
- Web: кнопки удаления заметки нет, не менялся.
- Документы: ADR-0176, CHANGELOG, R45.

## Риски

См. R45: роли, получавшие удаление чужих заметок только через `reports.notes`, теряют его до выдачи `reports.notes.edit` (выдаёт миграция ADR-0174 ролям с `reports.delete`).

## Миграции и seed

Нет.
