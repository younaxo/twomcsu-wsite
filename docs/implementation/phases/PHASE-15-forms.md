# PHASE 15 — Forms

## Сделано

- `modules/forms` — публичный `FormsController` (`/forms/*`): список
  опубликованных форм с учётом видимости (`GET /forms`), мои формы/мои
  ответы для автора (`GET /forms/my`, `GET /forms/my/responses`), автоподстановка
  `username`/`email` текущего пользователя (`GET /forms/autofill`), доступ по
  коду приглашения (`GET /forms/invite/:code`), получение формы по slug
  (`GET /forms/:slug`), отправка ответа (`POST /forms/:slug/responses`) и
  сохранение черновика (`POST /forms/:slug/responses/save-draft`).
- `FormsAdminController` (`/admin/forms`, 14 permission-ключей модуля `forms`):
  CRUD форм с вложенными полями (полная замена набора полей при `PATCH` —
  `deleteMany` + `create`, как у тегов News/порядка Topics), архивация вместо
  hard delete (есть реальные ответы респондентов), publish (требует ≥1 поля)/
  close, duplicate (генерация уникального `-copy`/`-copy-N` slug), список
  ответов/конкретный ответ/удаление ответа (с декрементом `responsesCount`),
  статистика (`totalResponses`/`completionRate`/разбивка по вариантам для
  RADIO/CHECKBOX/SELECT), CRUD приглашений (`FormInvite` — код, `maxUses`,
  `expiresAt`, `usedCount`).
- Генератор форм — 33 типа полей (`FormFieldType`), диспетчеризация
  валидации/хранения по типу в `FormsService.buildAnswerData()`:
  RADIO/SELECT → `textValue` (должен входить в `options`), CHECKBOX →
  `jsonValue` (массив строк, все — из `options`), NUMBER/RATING/
  CURRENCY_AMOUNT → `numberValue` (min/max), AGREEMENT_CHECKLIST →
  `booleanValue` (обязательно `true`, если поле required), DATE →
  `dateValue`, FILE_UPLOAD/IMAGE_GALLERY → `fileUrls` (уже готовые ссылки,
  без самой загрузки — см. «Не входит в эту фазу»), NEWS_REFERENCE/
  TOPIC_REFERENCE/FRIENDS_SELECTOR → реальная referential-проверка
  существования в уже реализованных доменах (ADR-0027), остальные 8
  доменных селекторов (домены ещё не реализованы) и общие текстовые типы →
  generic-путь с min/maxLength.
- Приём ответов: публикация/видимость/окно приёма (`opensAt`/`closesAt`)/
  лимит (`maxResponses`)/`onePerUser`/`requiresCaptcha` (hCaptcha через
  уже существующий `CaptchaService`) проверяются до сохранения; `INVITE_ONLY`
  обходит обычную проверку видимости кодом приглашения вместо permission,
  с проверкой `expiresAt`/`maxUses`/`usedCount`; `ipHash` (SHA-256 от IP, не
  сырой IP) и `userAgent` сохраняются для анти-спам аналитики.
- Черновики: `saveDraft()` — upsert `FormResponse`(`isComplete=false`) +
  per-field upsert `FormFieldAnswer` через новый unique-индекс
  `@@unique([responseId, fieldId])` (ADR-0028).

## Проверено реальным запуском

`apps/api/test/forms.e2e-spec.ts` — **17 тестов** против реального
Postgres+Redis, все прошли: создание формы требует `forms.create` (403 без
прав); RADIO/CHECKBOX/SELECT без `options` отклоняются с 400; черновик формы
недоступен публично (404), виден админу по id; публикация делает форму
видимой в `GET /forms/:slug` и `GET /forms`; пропуск обязательного поля и
недопустимое значение RADIO при отправке дают 400; анонимная отправка
увеличивает `responsesCount`; `onePerUser` блокирует повторную отправку тем
же пользователем; `maxResponses` блокирует отправку при достижении лимита;
черновик сохраняется и виден в `GET /forms/my/responses` с `isComplete:
false`; видимость `HELPER_ONLY` скрыта для обычного пользователя и видна
обладателю `forms.view.helper`; `INVITE_ONLY` — форма недоступна без кода,
доступна по коду, `usedCount` растёт, после исчерпания `maxUses` — 403;
NEWS_REFERENCE/TOPIC_REFERENCE/FRIENDS_SELECTOR реально проверяют
существование/актуальность (черновик новости и не-друг отклоняются с 400,
валидные ссылки проходят); статистика считает распределение по вариантам
RADIO, список/получение/удаление ответа администратором корректно
декрементирует `responsesCount`; close/duplicate/archive меняют статус и
`duplicate` копирует все поля; список форм с фильтром по статусу.

Полный набор из корня (16 e2e suite, 116 тестов) + `lint`/`format:check`/
`typecheck`/`build`/`test` — все зелёные.

## Не входит в эту фазу

- `POST /forms/:slug/responses/upload` — загрузка файлов для FILE_UPLOAD/
  IMAGE_GALLERY требует `StorageService` (PHASE 23, CDN/файлы — см. RISKS.md
  R3). Поля этих типов принимают уже готовые URL в `fileUrls` уже сейчас.
- `GET /admin/forms/templates`, `POST /admin/forms/from-template/:slug` —
  в схеме БД нет модели `FormTemplate` (не предусмотрена проектом БД для
  этой фазы); добавление шаблонов форм как отдельной сущности — вне scope
  PHASE 15, не входит в обязательный функционал docs-technical для данного
  этапа.
- `POST /admin/forms/:id/export` — экспорт ответов (CSV/XLSX) не реализован
  в этой фазе; `GET /admin/forms/:id/responses` уже отдаёт полный список
  ответов с полями, экспорт в файл — не блокер для MVP-функционала форм.
- Referential-валидация для PLAYER_SELECTOR/SERVER_SELECTOR/RANK_SELECTOR
  (PHASE 18), PRODUCT_SELECTOR/ORDER_SELECTOR (PHASE 17),
  REPORT_REFERENCE/PUNISHMENT_REFERENCE (PHASE 16), ACHIEVEMENT_SELECTOR
  (PHASE 19) — эти домены ещё не существуют (ADR-0027); значения
  принимаются и хранятся без проверки существования ID.
  **Обновление (PHASE 18):** `SERVER_SELECTOR` получил реальную
  referential-проверку (`Server.isActive`) сразу после появления модели
  `Server` — см. PHASE-18 doc и ADR-0027. `PRODUCT_SELECTOR`/
  `ORDER_SELECTOR`/`REPORT_REFERENCE`/`PUNISHMENT_REFERENCE` технически
  тоже уже можно проверять (модели существуют с PHASE 16/17), но это
  намеренно не сделано задним числом — зафиксированный techdebt для
  отдельного прохода, не забытая работа.
- Условная логика полей (`conditionalLogic`, `stepsConfig` для
  `multiStep`) хранится как есть (JSON от клиента), серверная интерпретация
  «показывать ли поле N в зависимости от ответа на поле M» — это
  frontend-логика; backend лишь хранит/отдаёт конфигурацию без собственной
  интерпретации.
