# Отчёт: 2FA персонала обязательна всегда (Q22, Q24), 2026-11-17

## 1. Итог

2FA персонала теперь обязательна всегда, флаг `requireAdmin2fa` не читается, охват закреплён в ADR-0169, добавлен офлайн-runbook аварийного доступа владельца. Статус: PARTIAL (код и документы готовы; e2e не запускались, review и security review не проводились, PR не создан).

## 2. Что сделано

Коммит К1 (a1b1e30, API и shared): 2FA персонала обязательна всегда. Единая проверка `isAdmin2faDenied` / `assertAdmin2fa` в `apps/api/src/modules/roles/guards/permissions.guard.ts`; кэш флага и `resetAdmin2faCache` удалены; таблица настроек для решения не читается. Охват: HTTP `PermissionsGuard` (любое `@RequirePermissions`), WS-gateway чата `apps/api/src/modules/chat/chat.gateway.ts` (`pin_message`, `mute_user`, `ban_user`, `delete_message` в модераторской ветке), `GET /communications/recipients` (`communications.controller.ts`, `assertAdmin2fa`). Колонка `SiteSettings.requireAdmin2fa` осталась в `schema.prisma` с `/// Deprecated`. Подробности проверок К1: см. отчёт К1 (директором).

Коммит К2 (8507dbe, web): изменения web под отсутствие переключателя; проверки К2 см. отчёт К2 (проверяется директором).

Коммит К3 (fe368f0, e2e): 28 файлов e2e изменено, 1 новый хелпер `apps/api/test/helpers/staff-two-factor.ts` (ставит `twoFactorEnabled=true` тестовым сотрудникам; test-only, секрет TOTP не создаётся).

Коммит К4 (документы), SHA К4 — коммит, содержащий этот файл (см. git log):

- `docs/runbooks/owner-emergency-access.md`: офлайн-процедура владельца (резервные коды, потеря устройства, SQL-сброс, последствия смены ключа, break-glass).
- ADR-0169 в `docs/implementation/DECISIONS.md` (Accepted, Q22/Q24; уточняет ADR-0109, ADR-0156).
- `docs/implementation/CHANGELOG.md`: запись в [Unreleased].
- `docs/implementation/RISKS.md`: R31-R34.
- Этот отчёт.

Выводы runbook, сверенные с кодом: резервный код принимается на втором шаге входа (`auth.service.ts:320-346`, `two-factor.service.ts:214-255`); перевыпуск резервных кодов требует код из приложения (`two-factor.service.ts:191-197`); `disable` принимает пароль и резервный код (`two-factor.service.ts:160-187`); при другом ключе вход кодом из приложения даст необработанную ошибку расшифровки (ожидается 500, не проверено запуском), вход резервным кодом даст 401.

### Исправления по ревью (раунд 1)

- К5 (39af4e7, код и unit-тесты): 2FA на проверках прав вне `PermissionsGuard`. `reports.controller.ts:61`, `reports.service.ts:286` (чтение чужого обращения по `reports.view`: 403 `admin_2fa_required`; автор без 2FA читает своё как игрок); `files.service.ts:111` (загрузка по праву персонала); `chat.service.ts:195` и `chat.gateway.ts:232` (отправка в read-only канал по `chat.messages.post_readonly`). Тесты: `reports.controller.spec.ts`, `reports.service.spec.ts`, `files.service.spec.ts`, `chat.service.spec.ts`.
- К6 (8a7a473): `admin-tools.service.ts` — `GET /admin/settings/site` не отдаёт `requireAdmin2fa` (тест `admin-tools.service.spec.ts`); комментарий в `two-factor.service.ts` приведён к Q22.
- К7 (документы): ADR-0169 (охват списком мест, «вне охвата» с обоснованием, F6 как следствие и смягчение R31, контракт API), CHANGELOG (заметка о 400 для старого клиента), `production-env-checklist.md` (ссылка на runbook аварийного доступа, пункт R31).
- Инвентаризация проверок прав вне guard: исправлено 3 места (reports, files, chat read-only); остальные в ADR-0169, «вне охвата». Открытый пробел: чтение staff-видимых событий, форм и тем без 2FA (`events.service.ts:38,53`, `forms.service.ts:79`, `topics.service.ts:36`) — нужна смена сигнатур в трёх модулях.
- e2e (статически): сотрудники в e2e файлов, чтения обращений и чата получают `markStaffTwoFactorEnabled` (`files.e2e-spec.ts:101`, `reports.e2e-spec.ts:71`, `reports-support.e2e-spec.ts:85`, `chat.e2e-spec.ts:74`); правки e2e не потребовались, прогонов нет.

## 3. Git

- Ветка `fix/q22-admin-2fa-always`, worktree `twomcsu-wsite-wt/stage00`.
- Коммиты: К1 a1b1e30, К2 8507dbe, К3 fe368f0 (HEAD до документов), К4 — SHA коммита с этим файлом (см. git log).
- PR не создан, push не выполнялся. Номер PR, CI и статус merge: нет.
- Состояние remote и `main` HEAD на момент отчёта не проверены этим исполнителем (нет доступа к git-командам); директору проверить `git branch -vv` и `git log -1 main`.

## 4. Проверки

К3 (e2e): `tsc` по `apps/api` чистый (каталог `test/` входит в `tsconfig.json`); eslint и prettier по изменённым файлам чисто.

- e2e НЕ запускались (запрет владельца): правки 28 файлов e2e и хелпера не подтверждены прогоном.
- Проверки К1 (unit api) и К2 (web: tsc, lint, тесты): не наблюдались исполнителем документов, см. отчёт К1/К2 (проверяется директором).
- Документы К4: сверка по коду выполнена чтением (ссылки путь:строка в runbook). Prettier для К4: см. результат, переданный директору в ответе исполнителя документов (на момент записи отчёта не запускался: у исполнителя нет оболочки). Запуск `npx prettier --check` на пяти файлах К4 остаётся за директором.
- Исправления по ревью (К5-К7): `tsc --noEmit` в api (включая test/) и shared без ошибок; `jest --runInBand` по api: 44 из 44 наборов, 422 из 422 тестов passed; eslint и prettier по изменённым файлам чисто (prettier с `--end-of-line auto`, CRLF рабочей копии не считается находкой).
- Ничего не выполнялось против БД; SQL в runbook только текст.

## 5. Что осталось, отложено, заблокировано

- Прогон e2e (R33; нужна команда владельца).
- Review и security review К1-К3.
- PR, CI, merge по правилам `main`.
- DROP колонки `requireAdmin2fa` (R34, ждёт решения владельца).
- Step-up (Q24 а): отдельная задача позже.
- Репетиция runbook на одноразовой локальной БД (R32).
- Устаревший комментарий в `two-factor.service.ts` обновлён по ревью (К6).
- Чтение staff-видимых событий, форм и тем без 2FA (ADR-0169, «вне охвата»): отдельная задача.

## 6. Решения, нужные от владельца

1. DROP колонки `SiteSettings.requireAdmin2fa`. Варианты: A, оставить deprecated навсегда; B, отдельная contract-миграция после релиза по ADR-0158 на одноразовой локальной БД с ревью, к production применяет владелец. Рекомендация: B позже, не срочно.
2. Step-up (повторное подтверждение 2FA для чувствительных операций): по Q24 позже, отдельной задачей. Подтвердить очерёдность. Рекомендация: после релиза этого изменения.
3. Подтвердить пометки «Допущение»: (а) явный development/test без ключа: требование не применяется, предупреждение при старте (ADR-0169); (б) break-glass-учётка (runbook, раздел д); (в) плановая ротация ключа только через предварительный сброс 2FA всем (runbook, раздел г). Рекомендация: подтвердить все три.

## 7. Риски и расхождения

- R31: lockout персонала без 2FA при заданном ключе (OPEN).
- R32: аварийный доступ зависит от офлайн-runbook, который не репетировался (OPEN).
- R33: e2e ставят `twoFactorEnabled=true` без секрета; реальный вход со 2FA не покрыт этими тестами (OPEN, принято).
- R34: колонка `requireAdmin2fa` не удалена (OPEN).
- Расхождения: ADR-0156 и ADR-0109 описывают флаг и кэш (исторически верно; актуальное поведение в ADR-0169); `docs/runbooks/production-env-checklist.md` ссылается на ADR-0161 и ADR-0156 про 2FA, ссылка на runbook аварийного доступа и пункт R31 добавлены по ревью (К7).
- Новое по ревью: пробел «чтение staff-видимого контента без 2FA» (events/forms/topics) и контракт API: старый web-клиент с `requireAdmin2fa` получит 400.
- Не проверено: фактический HTTP-ответ при расшифровке с другим ключом; срок действия access-токенов после сброса; допустимость ручной записи в `audit_logs`.
- Номера R31-R34 присвоены по `RISKS.md` этой ветки; в других ветках могли быть заняты (конфликт номеров возможен при merge).
- Расхождение пробелов в ключе: guard и схема env обрезают пробелы, `TwoFactorService` проверяет длину без `trim` (`two-factor.service.ts:50-51`).

## 8. NEXT EXACT STEP

Директору: запустить `npx prettier --check` на пяти файлах К4 и закоммитировать их одним коммитом (если ещё не сделано). Далее ближайшие шаги:

1. Review К1-К3 (twomc-reviewer) и security review (twomc-security).
2. Запуск e2e по команде владельца.
3. Push, PR и CI; merge по правилам `main` (политика Git полностью на агенте).
4. Решения владельца по разделу 6.
5. Обновить `production-env-checklist.md` ссылкой на ADR-0169 и runbook (отдельным коммитом) и CHECKPOINT.
