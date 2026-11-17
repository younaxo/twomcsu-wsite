# Q52: права на удаление заметок обращений (ADR-0176)

Ветка fix/q52-delete-notes-perms (от 886ff98), не смержена.

## Решение владельца

Удаление чужой заметки только с `reports.notes.edit`; чужую закреплённую удаляет тот, у кого есть и `reports.notes.edit`, и `reports.notes.unpin`.

## Изменения

- `apps/api/src/modules/reports/reports-moderation.service.ts`: `deleteModeratorNote` принимает `actorId`; своя заметка без проверки прав; чужая требует edit; чужая закреплённая требует edit и unpin; иначе `ForbiddenException` (403).
- `apps/api/src/modules/reports/reports-moderation.controller.ts`: передаёт `user.id`.
- `apps/api/src/modules/reports/reports-moderation.service.spec.ts`: 9 unit-тестов (своя закреплённая; чужая без права; с edit; закреплённая с edit без unpin; только unpin без edit; с обоими правами; 404: нет заметки, заметка другого обращения, нет обращения).
- `apps/api/src/modules/reports/reports-rbac.spec.ts`: 2 теста контроллера (право `reports.notes` на DELETE, передача `user.id`).
- e2e `apps/api/test/reports.e2e-spec.ts` (дописан статически, НЕ запускался, проверен только tsc): добавлены сотрудники peer (`reports.notes`) и senior (`reports.notes` + `reports.notes.edit`), 2FA через `markStaffTwoFactorEnabled`; сценарии: чужая без edit 403; чужая закреплённая с edit без unpin 403; автор удаляет свою закреплённую 200; чужая незакреплённая с edit 200.
- Ревью ветки D (APPROVE WITH NOTES) закрыто: тесты, тело ADR-0176 (автор и закреплённая), чек-лист владельца (порядок, TTL кэша прав 300 с, SQL по ролям, проверка миграции Q50 на одноразовой БД — не выполнена), R44/R45.
- Web: кнопки удаления заметки нет, не менялся.
- Документы: ADR-0176, CHANGELOG, R45.

## Риски

См. R45: роли, получавшие удаление чужих заметок только через `reports.notes`, теряют его до выдачи `reports.notes.edit` (выдаёт миграция ADR-0174 ролям с `reports.delete`).

## Миграции и seed

Нет.
