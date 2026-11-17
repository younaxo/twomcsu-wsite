# Контракт API наказаний (этап 02, срез 2)

Статус: Proposed (ADR-0180), ждёт повторного ревью Quality & Security (раунд исправлений 1 внесён). Код, схема, миграции и файлы `packages/shared` этим документом НЕ создаются; миграция индекса среза 2 только описана (2.6).

Источники: `LITEBANS-INTEGRATION-DESIGN.md` (разделы 4.6, 5, 6), код среза 1 (`apps/api/src/modules/punishments/`), Q31 и Q58 (`docs/agent-prompts/08-OWNER-ANSWERS-Q14-Q32.md`, `docs/reports/QUESTIONS-FOR-OWNER.md`), Q59 (ответ владельца, `docs/agent-prompts/09-OWNER-AWAY-QUEUE.md`, дополнение 1), Q57 (рекомендации О1 и О3 действуют как допущения до ответа), ADR-0166, ADR-0169, ADR-0178.

## 1. Принципы

1. Закрыто по умолчанию: без `LITEBANS_ENABLED` и без данных модуль бездействует, публичные эндпоинты не раскрывают причину.
2. Публичный ответ строится по белому списку полей (явная сборка объекта, не вычитание лишнего). Данные зеркала уже очищены в срезе 1, но публичный слой не полагается на очистку: причина наружу уходит только как ключ из закрытого словаря (раздел 3).
3. Все строки в ответах - обычный текст. Ни разметки, ни HTML, ни автоссылок; клиент выводит их как текст (React-экранирование), без `dangerouslySetInnerHTML` и без linkify.
4. IP, `uuid` нарушителя (публично) и контакты не отдаются никогда. Персонал видит только флаг `ipBan`; сам адрес не читается из БД вообще.
5. Слой чтения только читает зеркало (`MinecraftPunishment`, `PunishmentSyncState`); записи нет.

## 2. Эндпоинты

Префикса `/api` в коде нет, пути как у существующих контроллеров. Веб-маршрут `/bans` (Next.js) и API-путь не совпадают намеренно: `/bans` на домене сайта обслуживает фронтенд.

| Метод и путь                    | Доступ                              | Назначение                                     |
| ------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `GET /punishments/public`       | без входа, throttle 60/мин          | список для `/bans`                             |
| `GET /punishments/public/:ref`  | без входа, throttle 60/мин          | карточка одного наказания, `noindex`           |
| `GET /punishments/me`           | `JwtAuthGuard`, throttle 30/мин     | «Наказания на сервере» (только по своему uuid) |
| `GET /admin/punishments`        | `users.punishments` (+2FA), 120/мин | список персонала, полный текст причины         |
| `GET /admin/punishments/status` | `users.punishments` (+2FA), 120/мин | состояние синхронизации (без хоста и паролей)  |
| `GET /admin/punishments/:ref`   | `users.punishments` (+2FA), 120/мин | карточка для персонала                         |

Маршрут `status` объявляется ДО `:ref`. Throttle задаётся `@Throttle` (глобальный `IpSubnetThrottlerGuard`, ADR-0177: IPv6 по /64). Всё только `GET`; записывающих методов нет (скрытие записей, заметки, настройки и обжалование - позже, раздел 9).

Контроллеры (модуль `PunishmentsModule`, `apps/api/src/modules/punishments`): `MinecraftPunishmentsPublicController`, `MinecraftPunishmentsMeController`, `MinecraftPunishmentsAdminController`. Имя `PunishmentsController` НЕ использовать: оно занято в `apps/api/src/modules/reports/punishments.controller.ts` (наказания САЙТА, `UserPunishment`). Проверка (grep по `apps/api/src`): новых имён в коде нет; маршруты `punishments/public*`, `punishments/me`, `admin/punishments*` не пересекаются с существующими `users/me/punishments`, `admin/users/:username/punishments`, `admin/users/:userId/punishments`.

Два независимых списка наказаний у игрока: существующий `GET users/me/punishments` (наказания САЙТА, `UserPunishment`, идентификатор cuid, обжалуемые) и новый `GET /punishments/me` (зеркало игровых наказаний, идентификатор `ref`, пока не обжалуемые). Во фронтенде они показываются как два раздельных блока или вкладки «Наказания на сайте» и «Наказания на сервере» и не сливаются в один список.

### 2.1 Общие правила запросов

- `ValidationPipe` проекта (`whitelist`, `forbidNonWhitelisted`, `transform`): неизвестный параметр или неверное значение - 400 стандартного формата NestJS (`message: string[]`).
- `limit`: целое 1..50 (по умолчанию 25); у персонала 1..100 (по умолчанию 50).
- `order`: `desc` (по умолчанию) или `asc`; сортировка всегда по `(startedAt, id)`, второй ключ - `id` зеркала (стабильный порядок). Других сортировок нет (минимум поверхности и индексов).
- Кодирование массивов: повторяющийся параметр `kind=BAN&kind=MUTE` (не запятая, не `kind[]`); то же для `status` у персонала. `@Transform` приводит одиночное значение к массиву; дубликаты значений схлопываются.
- Булевы (`silent`, `ipBan`, `hidden`): принимаются только строки `true` и `false` (явный разбор, не `Boolean("false")`); иное значение - 400.
- Форматы: `subjectUuid` - `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` (нормализуется к нижнему регистру); `nameExact` - `^[A-Za-z0-9_.]{1,16}$`; `from` и `to` - ISO-8601 UTC с обязательным суффиксом `Z`; `from > to` - 400 (стандартный формат), `from == to` допустим.
- Raw SQL (`$queryRaw`) - только параметры (`Prisma.sql` или шаблонные параметры), никакой конкатенации значений в текст запроса; значения `LIKE` предварительно экранируются (2.2).
- `cursor`: непрозрачная строка до 200 символов, формат `base64url(JSON {t: startedAtMs, i: id, o: order, f: фильтры})`, где `f` - короткий хэш (SHA-256, первые 16 hex) нормализованного набора фильтров (все параметры, кроме `cursor`, `limit`, `order`). Разбор строгий: неверный, выданный для другого `order` или для другого набора фильтров - 400 `punishments_invalid_cursor`. Смена статуса записи между страницами: ключ keyset `(startedAt, id)` неизменен, дублей нет; запись может исчезнуть из выдачи (стала `ended`, скрыта) или появиться на последующих страницах (ранее не подходила под фильтр) - принято. Курсорная, а не страничная пагинация: список живой, смещение по `page` дублировало бы и пропускало записи; поэтому ответ не `Paginated<T>` (отличие от `packages/shared/src/api/common.ts`). Общего `total` нет: счёт по закрытому разрезу дорог и раскрывал бы число скрытых записей.
- Время - ISO-8601 UTC. `until === null` означает «бессрочно» (`permanent: true`).

### 2.2 GET /punishments/public

Параметры: `kind` (`BAN` или `MUTE`), `status` (`active` или `ended`), `name` (префикс ника без учёта регистра, `^[A-Za-z0-9_.]{3,16}$`), `order`, `cursor`, `limit`.

- `active` = `status = ACTIVE` И (`until` пусто ИЛИ `until > now()`). `ended` - остальные (EXPIRED, REMOVED, а также ACTIVE с истёкшим `until`, который слой T ещё не отметил). Статус элемента вычисляется при чтении той же функцией `computePunishmentStatus` (срез 1): зеркало может отставать, истёкший срок не должен показываться «активным».
- Поиск `name`: через `$queryRaw` вида `lower("subjectName") LIKE lower($1) || '%' ESCAPE '\'`, где `\`, `_`, `%` в значении предварительно экранируются (`_` в нике ищется буквально: `a_b` не находит `aXb`). Prisma `startsWith` с `mode: 'insensitive'` даёт `ILIKE`, который индекс по `lower(...)` не использует, поэтому не применяется. Оговорка: при параметризованном шаблоне планировщик может выбрать generic plan без индекса; проверка `EXPLAIN` (в т.ч. при `plan_cache_mode = force_generic_plan`) на одноразовой БД обязательна. Запасной вариант, если индекс не используется: диапазонное сравнение по lower-префиксу (`lower("subjectName") >= $1 AND lower("subjectName") < $2`, где `$2` - префикс с увеличенным последним символом), без `LIKE` и без экранирования. Индекс и миграция - 2.6.

Предикат публичности (единая функция `publicVisibilityWhere`; её же использует карточка и будущий WebSocket):

1. `kind` из `BAN`, `MUTE` (Q57/О1 допущение; WARN и KICK не публикуются).
2. `isHidden = false`; `status != DELETED_AT_SOURCE`; безусловно `ipBan = false` (Q31: IP и связанное с ним не показываются никогда: бан по адресу не публикуется вообще, даже если у записи есть валидный ник).
3. `silent = false` (допущение О1; настройка `punishments.public.hideSilent`, по умолчанию `true`).
4. `subjectName` задан, не содержит маркер `[скрыто]` и соответствует `^[A-Za-z0-9_.]{1,16}$`. Так записи без ника и с испорченным ником не попадают в публичный вывод (IP-баны исключены уже п.2). Формат ника проверяется в SQL-условии (`$queryRaw`) или предвычисленным при записи зеркала полем (миграция - только после решения); способ выбирает бэкенд-лидер после ревью. Фильтрация в приложении после выборки запрещена (ломает курсор и размер страницы).
5. Раздел включён: `SiteSetting punishments.public.enabled = 'true'` (по умолчанию выключен, раздел 5).

Ответ `PublicPunishmentListResponse` (раздел 6): `{ items, nextCursor, meta }`.

### 2.3 GET /punishments/public/:ref

`ref` - `^(ban|mute)-[1-9][0-9]{0,17}$` (не более 18 цифр, чтобы не переполнить `bigint`, 2^63-1). Запись, не прошедшая предикат 2.2, несуществующая и значение вне формата (в т.ч. `ban-99999999999999999999`, `ban-9223372036854775808`) дают один и тот же ответ 404 `punishments_not_found` с одинаковым телом; регэксп проверяется ДО приведения к `bigint`. Выборка по `ref` всегда с `source = 'litebans'` и `sourceScope = 'default'` (ключ уникальности `[source, sourceScope, kind, sourceId]`). Сверка с `publicRef` среза 1 (`punishment.types.ts`): функция собирает `kind.toLowerCase() + '-' + sourceId` без проверки формата, поэтому для `sourceId` из 19 цифр (до 9223372036854775807) она выдала бы `ref`, не проходящий новый регэксп; для автоинкрементных id LiteBans это недостижимо, расхождение принято и отмечено (срез реализации добавляет проверку длины в ту же точку, где строится `ref`). Времени ответа контракт не обещает (механизма выравнивания нет). Поля те же, что у элемента списка. Заголовок `X-Robots-Tag: noindex, nofollow`; веб-страница `/bans/[ref]` обязана выставлять `robots: noindex` (Q57/О5). Если фронтенд не будет использовать карточку, эндпоинт можно не включать: новых данных он не даёт.

Известное свойство: `ref` содержит последовательный `sourceId`, пропуски в нумерации показывают число непубличных записей (WARN, KICK, скрытые, silent) без их содержимого. Принято как низкий риск (дизайн 5.3). Непрозрачный публичный идентификатор потребовал бы поле в схеме - не принимается без решения.

### 2.4 GET /punishments/me

- Субъект - только `MinecraftAccount.uuid` текущего пользователя (ADR-0072); выборка `where subjectUuid = uuid`. По нику не выбирается никогда (ник переиспользуется). Параметров, позволяющих указать чужой uuid или ник, нет.
- Параметры: `kind` (повторяемый `BAN|MUTE|WARN|KICK`, по умолчанию все), `status` (`active` или `ended`), `order`, `cursor`, `limit`.
- Нет привязки: 200 `{ linked: false, items: [], nextCursor: null, meta }` - клиент показывает «привяжите Minecraft» (не 404, чтобы не путать с отсутствием раздела).
- Офлайн-UUID (дизайн `LITEBANS-INTEGRATION-DESIGN.md` 5.2): при `online_mode: false` без подтверждённой аутентификации любой может зайти под ником забаненного, привязать его офлайн-UUID и увидеть чужую историю. Если uuid привязки версии 3 (offline; 13-й hex-символ без дефисов, то есть первый символ третьей группы, равен `3`) и подтверждённой аутентификации нет - отдаётся `linked: false` и пустой список. Механизма «подтверждённой аутентификации» в коде сегодня нет, поэтому контракт фиксирует fail-closed: ЛЮБОЙ uuid версии 3 даёт `linked: false`, пока владелец не ответит на вопрос про `online_mode` (вопрос владельцу, записывает chief). Тест обязателен.
- Показываются все четыре вида, включая записи, скрытые администратором (`isHidden`) и silent; не показываются `DELETED_AT_SOURCE` (запись исчезла в источнике и не действует; допущение Д3).
- Полный очищенный текст причины (Q59); это очищенный текст, а не словарь. Очистка эвристическая (R56) и может оставить остатки чужих данных; риск ограничен тем, что игрок видит только свои записи. Причина снятия (`removedReason`), выдавший и снявший игроку НЕ отдаются (допущение Д3, chief); `uuid` и IP - никогда.
- Раздел во фронтенде - «Наказания на сервере», отдельный от «Наказаний на сайте» (раздел 2).
- `Cache-Control: private, no-store`, `Vary: Authorization`; ETag не отдаётся (персональные данные).

### 2.5 Эндпоинты персонала

- Право `users.punishments` (Q57/О3 допущение, без нового seed): `@UseGuards(JwtAuthGuard, PermissionsGuard)` и `@RequirePermissions`. Обязательная 2FA действует через `PermissionsGuard` (ADR-0169): нет 2FA - 403 `{ code: 'admin_2fa_required' }`. Отдельный `assertAdmin2fa` не нужен, тест на 403 обязателен.
- Замечание о праве: `users.punishments` сегодня разрешает также выдачу наказаний сайта (`UserPunishment`). Просмотр зеркала этим правом расширяет охват права; допущение: право пока `users.punishments`; отдельное `punishments.view` (seed, решение владельца) - вопрос владельцу Q63 (записан chief).
- Параметры списка: `kind` (повторяемый), `status` (повторяемый; `ACTIVE|EXPIRED|REMOVED|DELETED_AT_SOURCE`, с read-time пересчётом), `name` (префикс 3-16) или `nameExact`, `subjectUuid`, `silent`, `ipBan`, `hidden`, `from`, `to` (по `startedAt`), `order`, `cursor`, `limit`.
- Персонал видит `DELETED_AT_SOURCE` и скрытые записи, полный очищенный текст причины и причину снятия, uuid, выдавшего и снявшего, `ipBan` (флаг), `silent`, область, `template`, `rev`, метки времени зеркала. IP отсутствует по построению.
- `GET /admin/punishments/status` - `PunishmentsAdminStatus`: `enabled`, `configured`, по каждому виду `initialSyncDone`, `lastSuccessAt`, `consecutiveFailures`, `lastErrorCode` (только код `SOURCE_*`). Тексты ошибок, хост, учётные данные не отдаются.
- Аудит (требование, не вопрос): каждый поиск (список) и каждая карточка персонала пишутся в `AuditLog`. Для списка - нормализованные параметры фильтров без тела выдачи; для карточки - `ref` и `subjectUuid`. Поля выдавшего и снявшего показываются по праву (допущение: `users.punishments`, Q63).

### 2.6 Индекс и миграция среза 2

Решение chief: ОТДЕЛЬНАЯ миграция среза 2, только `CREATE INDEX` (без `DROP` и `ALTER` существующего). SQL пишется вручную по Q43(а), ревью по Q28 (решение владельца Q28, `docs/agent-prompts/08-OWNER-ANSWERS-Q14-Q32.md`). Уже одобренная миграция среза 1 `20261117020000_punishments_mirror` не изменяется. Файл миграции этим документом НЕ создаётся, только описывается:

- индекс-выражение `lower("subjectName") text_pattern_ops` для префиксного поиска ника (2.2);
- частичный индекс под публичный предикат и сортировку `(startedAt, id)`: `WHERE kind IN ('BAN','MUTE') AND "isHidden" = false AND silent = false AND "ipBan" = false AND status <> 'DELETED_AT_SOURCE'`; точное определение (набор и порядок колонок) уточняется `EXPLAIN` на одноразовой БД;
- порядок работ: миграция и её независимое ревью ДО написания контроллеров; применяется только к одноразовой локальной БД; применение к production - только владелец.

## 3. Публичная причина (Q59)

### 3.1 Закрытый словарь

Публично наружу выходит НЕ текст из базы, а элемент закрытого словаря, заданного в коде:

| `key`         | Подпись (`label`) |
| ------------- | ----------------- |
| `cheats`      | Читы              |
| `abuse`       | Оскорбления       |
| `spam`        | Спам              |
| `advertising` | Реклама           |
| `evasion`     | Обход наказания   |
| `other`       | Прочее            |
| `rules`       | Нарушение правил  |

`rules` - значение по умолчанию («всё остальное»). `other` выдаётся только когда шаблон или фраза явно отнесены к «Прочее». Подписи фиксированы в коде; клиент берёт `label` из ответа.

### 3.2 Определение категории

Порядок, останавливается на первом совпадении:

1. Если `isReasonMasked(reason)` (в сохранённой причине есть маркер `[скрыто]`) - `rules`. Условие выше остальных: очистка что-то скрыла, причина скрывается целиком (допущение Q59 как дополнительная защита; в той же роли остаётся `publicReason` среза 1).
2. Шаблон LiteBans: `template` (не `null`; значение 255 уже превращено в `null` в срезе 1) ищется в карте `templateMap` (`template -> key`). LiteBans хранит только номер шаблона, его смысл задан конфигом сервера, поэтому карту задаёт владелец (В1).
3. Точная фраза: причина нормализуется (`NFKC`, нижний регистр, схлопывание пробелов, обрезка пробелов и завершающих `.!`) и сравнивается с точными записями списка разрешённых формулировок (`phraseMap`: фраза до 64 символов -> key). Только равенство целой строки: поиск подстроки, ключевые слова и нечёткое сравнение ЗАПРЕЩЕНЫ (они пропустили бы свободный текст).
4. Иначе - `rules`.

Источник карт: встроенные значения по умолчанию в коде (небольшой список очевидных формулировок вроде «Читы», «Cheating», «Оскорбления», «Спам», «Реклама») плюс необязательное переопределение в `SiteSetting punishments.public.reasonMap` (JSON `{ templates: {"<id>": key}, phrases: {"<фраза>": key} }`, не более 200 записей, значения только из закрытого списка ключей; неверный JSON или значение отбрасывается целиком, действуют значения по умолчанию, в лог пишется факт без содержимого). Запись карты через API - в срезе админ-управления (раздел 9).

### 3.3 Гарантии и обязательные тесты

- Публичный ответ не содержит ни одного байта произвольного текста: `reason.label` принадлежит словарю из 7 строк. Это единственный вариант с гарантией (Q59 б); очистка среза 1 остаётся второй линией защиты.
- Тест-перечисление: для каждого сырого образца из корпуса обходов очистки (`text-sanitizer.spec.ts`: телефоны через `/`, IP с юникод-точками, кириллические домены, `tg`/`ig`/`vk id`, bidi, нулевой ширины, длинные строки) результат публичного маппера - всегда один из семи ключей с подписью словаря.
- Тест на форму ответа: набор ключей публичного элемента равен ровно перечисленным в разделе 6 (нет `uuid`, `ipBan`, `silent`, `template`, `removedReason`, `scope`; `executor` отсутствует при выключенной настройке); сравнение на всех уровнях вложенности.
- Тест: причина с маркером `[скрыто]` при совпадающем `template` всё равно даёт `rules`.
- Тест: фраза «читы и пишите мне в тг @x» (содержит слово словаря как подстроку) даёт `rules`, а не `cheats`.

## 4. Выдавший, причина снятия, область

- Выдавший в публичном ответе по умолчанию отсутствует как ключ (не `null`, чтобы форма ответа не выдавала настройку). Если `SiteSetting punishments.public.showExecutor = 'true'` (по умолчанию `false`, Q31), добавляется `executor: { console: true } | { name: string }`; `uuid` не отдаётся никогда; имя - очищенная метка из зеркала.
- Причина снятия и кто снял публично не отдаются (Q58-2 допущение); только `status = REMOVED` и `removedAt`.
- Область и сервер публично не отдаются (в Q31 их нет; дизайн 5.1 предлагал фильтр по области - отклонено допущением Д4). Игрок и персонал видят `scope`.

## 5. Включение, недоступность и ответы

Порядок проверок (одинаков для публичных эндпоинтов и `me`; у персонала шаги 3 и 5 опускаются, «нужные виды» на шаге 6 - все четыре):

1. Throttle - 429 (глобальный `IpSubnetThrottlerGuard`).
2. Аутентификация и права - 401/403 (`me`, персонал; для публичных шага нет).
3. (Публичные) раздел выключен - 404 `punishments_public_disabled`.
4. Валидация query - 400 (`ValidationPipe`, `punishments_invalid_cursor` для курсора).
5. (`me`) нет привязки или uuid версии 3 (2.4) - 200 `linked: false`.
6. Нет первичной загрузки нужных видов - 503 `punishments_unavailable`.
7. Данные - 200 (`meta.stale` по формуле ниже).

Согласование с конвейером NestJS: глобальный `ValidationPipe` (`apps/api/src/configure-app.ts`) выполняется ПОСЛЕ guard-ов, а до обработчика. Поэтому проверка «раздел выключен» (шаг 3) обязана быть guard-ом (`canActivate`, бросает 404), иначе запрос с неверным query получил бы 400 вместо 404 и выдал бы существование раздела. Шаги 5-6 выполняются в сервисе после валидации, как и требует порядок.

| Условие                                                                                                                                     | Ответ                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Публичный раздел выключен (`punishments.public.enabled` не равен `true`, по умолчанию) - только `GET /punishments/public*`                  | 404, тело `{ statusCode: 404, code: 'punishments_public_disabled', message: 'Раздел не найден.' }` (как будто маршрута нет)           |
| У любого из нужных видов нет `initialSyncDoneAt` (в т.ч. строки `PunishmentSyncState` нет; источник выключен, не настроен или ещё грузится) | 503, тело `{ statusCode: 503, code: 'punishments_unavailable', message: 'Данные временно недоступны.' }`, заголовок `Retry-After: 60` |
| Первичная загрузка всех нужных видов завершена, но синхронизация давно не успешна или источник выключен позже                               | 200 как обычно, `meta.stale = true`                                                                                                   |

- «Нужные виды»: для публичных эндпоинтов - `BAN` и `MUTE`; для `me` и персонала - все четыре (иначе игрок увидел бы неполную историю как полную; при неполной загрузке WARN и KICK - 503).
- Публичный и «мой» ответы не различают «не настроено» и «ещё грузится» (не раскрывать инфраструктуру); персонал видит причину в `GET /admin/punishments/status`.
- Форма 503 как у `SiteModuleGuard` (`statusCode`, `code`, `message`). `@SiteModule` здесь не используется: он управляет режимом раздела сайта и обходом техработ; привязка к реестру `SITE_MODULES` - решение фронтенда и админки, контракт не меняет.
- `meta.stale` - одна формула для нескольких видов: stale = источник выключен ИЛИ у любого нужного вида `lastSuccessAt` пуст или старше порога (берётся самый старый `lastSuccessAt`; порог по умолчанию 5 минут, константа в коде). Публично `meta.stale` остаётся boolean (без метки времени и кодов ошибок источника).
- Пустые состояния для UX клиента: 200 с пустым `items` (нет записей по фильтру) отличается от 404 (раздел выключен, `ref` не найден) и от 503 (данные недоступны); у `me` отдельно `linked: false`. Клиент показывает три разных состояния: «ничего не найдено», «раздел недоступен», «данные временно недоступны».
- При `LITEBANS_ENABLED=false` слой чтения обращается только к Prisma: соединений и побочных эффектов нет.
- Юридическое условие включения: публичный раздел включается (`punishments.public.enabled = 'true'`) только после юридической оценки владельцем по 152-ФЗ, срока хранения и процедуры скрытия записей. До этого он выключен (по умолчанию).

## 6. DTO и типы

Файл `packages/shared/src/api/punishments.ts` (предлагаемый; не создаётся этим документом) и локальная копия в `apps/api` (раздел 7). Классы `class-validator` для query-DTO живут только в `apps/api`; здесь формы ответов и значения.

```ts
// packages/shared/src/api/punishments.ts (предлагаемый текст)
import type { ApiErrorBody, IsoDateString } from './common';

export const PUNISHMENT_PUBLIC_KINDS = ['BAN', 'MUTE'] as const;
export type PunishmentPublicKind = (typeof PUNISHMENT_PUBLIC_KINDS)[number];

export const PUNISHMENT_KINDS = ['BAN', 'MUTE', 'WARN', 'KICK'] as const;
export type PunishmentKind = (typeof PUNISHMENT_KINDS)[number];

/** Публичный и «мой» статус: DELETED_AT_SOURCE наружу не выходит. */
export const PUNISHMENT_VIEW_STATUSES = ['ACTIVE', 'EXPIRED', 'REMOVED'] as const;
export type PunishmentViewStatus = (typeof PUNISHMENT_VIEW_STATUSES)[number];
export type PunishmentStaffStatus = PunishmentViewStatus | 'DELETED_AT_SOURCE';

export const PUNISHMENT_REASON_KEYS = [
  'cheats',
  'abuse',
  'spam',
  'advertising',
  'evasion',
  'other',
  'rules',
] as const;
export type PunishmentReasonKey = (typeof PUNISHMENT_REASON_KEYS)[number];

export const PUNISHMENT_ERROR_CODES = [
  'punishments_public_disabled',
  'punishments_not_found',
  'punishments_unavailable',
  'punishments_invalid_cursor',
  'admin_2fa_required',
] as const;
export type PunishmentErrorCode = (typeof PUNISHMENT_ERROR_CODES)[number];

export type PunishmentOrder = 'asc' | 'desc';
export type PunishmentActivityFilter = 'active' | 'ended';

/** Ровно одно поле: консоль или имя. */
export type PublicPunishmentExecutor = { console: true } | { name: string };

export interface PublicPunishment {
  /** `ban-123` / `mute-45`. */
  ref: string;
  kind: PunishmentPublicKind;
  /** Ник нарушителя, 1-16 символов, `[A-Za-z0-9_.]`. */
  subjectName: string;
  status: PunishmentViewStatus;
  startedAt: IsoDateString;
  /** null - бессрочно. */
  until: IsoDateString | null;
  permanent: boolean;
  /** Только при status === 'REMOVED', иначе null. */
  removedAt: IsoDateString | null;
  reason: { key: PunishmentReasonKey; label: string };
  /** Ключ присутствует только если включён `punishments.public.showExecutor`. */
  executor?: PublicPunishmentExecutor;
}

export interface PunishmentResponseMeta {
  /** Момент формирования ответа (в ETag не входит). */
  generatedAt: IsoDateString;
  /** Данные источника давно не обновлялись или источник выключен. */
  stale: boolean;
}

export interface PublicPunishmentListResponse {
  items: PublicPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

export interface PublicPunishmentResponse {
  item: PublicPunishment;
  meta: PunishmentResponseMeta;
}

export interface PunishmentListQuery {
  cursor?: string;
  limit?: number;
  order?: PunishmentOrder;
}

export interface PublicPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentPublicKind;
  status?: PunishmentActivityFilter;
  name?: string;
}

/** Мои наказания: полный очищенный текст причины. */
export interface MyPunishment {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentViewStatus;
  startedAt: IsoDateString;
  until: IsoDateString | null;
  permanent: boolean;
  removedAt: IsoDateString | null;
  /** Очищенный текст (plain text, до 2048 символов); null - не указана. */
  reason: string | null;
  /** В очистке что-то было скрыто: в тексте есть маркер `[скрыто]`. */
  reasonMasked: boolean;
  /** Область действия (сервер или группа), если задана. */
  scope: string | null;
  /** Всегда false до среза обжалования зеркальных наказаний (раздел 9). */
  appealable: boolean;
}

export interface MyPunishmentListResponse {
  /** false - нет подтверждённой привязки Minecraft-аккаунта. */
  linked: boolean;
  items: MyPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

export interface MyPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentKind[];
  status?: PunishmentActivityFilter;
}

export interface StaffPunishmentActor {
  console: boolean;
  uuid: string | null;
  name: string | null;
}

export interface StaffPunishment {
  ref: string;
  kind: PunishmentKind;
  status: PunishmentStaffStatus;
  subjectUuid: string | null;
  subjectName: string | null;
  /** Бан по адресу. Сам адрес не хранится и не отдаётся. */
  ipBan: boolean;
  silent: boolean;
  reason: string | null;
  reasonMasked: boolean;
  executor: StaffPunishmentActor | null;
  startedAt: IsoDateString;
  until: IsoDateString | null;
  permanent: boolean;
  removedAt: IsoDateString | null;
  removedBy: StaffPunishmentActor | null;
  removedReason: string | null;
  scope: string | null;
  origin: string | null;
  template: number | null;
  isHidden: boolean;
  hiddenReason: string | null;
  deletedAtSource: IsoDateString | null;
  rev: number;
  firstSeenAt: IsoDateString;
  lastChangedAt: IsoDateString;
}

export interface StaffPunishmentListQuery extends PunishmentListQuery {
  kind?: PunishmentKind[];
  status?: PunishmentStaffStatus[];
  name?: string;
  nameExact?: string;
  subjectUuid?: string;
  silent?: boolean;
  ipBan?: boolean;
  hidden?: boolean;
  from?: IsoDateString;
  to?: IsoDateString;
}

export interface StaffPunishmentListResponse {
  items: StaffPunishment[];
  nextCursor: string | null;
  meta: PunishmentResponseMeta;
}

export interface PunishmentsAdminStatus {
  enabled: boolean;
  configured: boolean;
  kinds: Array<{
    kind: PunishmentKind;
    initialSyncDone: boolean;
    lastSuccessAt: IsoDateString | null;
    consecutiveFailures: number;
    /** Только код `SOURCE_*`. */
    lastErrorCode: string | null;
  }>;
}

/**
 * Ошибка с кодом модуля: `ApiErrorBody` с обязательным `code`. Стандартные
 * 400/401/403/429 могут идти без `code` (тогда это обычный `ApiErrorBody`);
 * клиент ветвится по `statusCode`.
 */
export interface PunishmentErrorBody extends ApiErrorBody {
  code: PunishmentErrorCode;
}
```

Примечания к типам:

- `reasonMasked` у `MyPunishment` и `StaffPunishment` равен `isReasonMasked(reason)` (в базе уже очищенная причина; отдельное поле схемы не нужно).
- `StaffPunishment.executor` содержит `uuid` выдавшего (это персонал); `subjectUuid` виден только персоналу.
- `removedAt` для EXPIRED всегда `null` (срок истёк сам); конец срока - `until`.
- Ключ `executor` в `PublicPunishment` опционален по построению (раздел 4); тест формы проверяет оба режима настройки.
- Формат ошибок - как у существующих модулей: стандартное тело NestJS с дополнительным `code` (`ApiErrorBody`, `SiteModuleGuard`, `admin_2fa_required`, `role_permissions_exceed_grantor`). Подробно - 6.3.
- `MyPunishment` не содержит `removedReason` (2.4): причина снятия игроку не отдаётся.
- `MyPunishmentListQuery.kind` и `StaffPunishmentListQuery.kind/status` - массивы, в URL кодируются повторяющимся параметром (2.1).

### 6.1 Заголовки ответов

| Эндпоинт             | `Cache-Control`                                 | `ETag`           | `X-Robots-Tag`      |
| -------------------- | ----------------------------------------------- | ---------------- | ------------------- |
| `public` (список)    | `public, max-age=15, stale-while-revalidate=30` | слабый, да (6.2) | `noindex, nofollow` |
| `public/:ref`        | `public, max-age=15, stale-while-revalidate=30` | слабый, да       | `noindex, nofollow` |
| `me`                 | `private, no-store`, `Vary: Authorization`      | нет              | нет                 |
| `admin/*`            | `private, no-store`, `Vary: Authorization`      | нет              | нет                 |
| ответы 404 и 503     | `no-store` (503 с `Retry-After: 60`)            | нет              | `noindex`           |
| ответы 400, 401, 403 | `no-store`                                      | нет              | нет                 |
| ответ 429            | `no-store`, `Retry-After` (6.3)                 | нет              | нет                 |

Ответы об ошибках (400, 401, 403, 404, 429, 503) никогда не кэшируются по ETag: `If-None-Match` на ошибочный ответ не даёт 304 (проверка ETag выполняется только для успешного 200).

### 6.2 Кэш и ETag

- ETag публичных ответов - слабый, хэш SHA-256 канонической сериализации тела БЕЗ `meta.generatedAt` (иначе он менялся бы при каждом запросе и `If-None-Match` не срабатывал бы). Совпадение `If-None-Match` - 304 без тела (только поверх 200). Реализация обязана проверить тестом, что ETag действительно выставляется и что `generatedAt` в него не входит.
- Серверный кэш: процессный, ограниченный по размеру (до 100 ключей с вытеснением LRU, TTL 5 с; ключ - нормализованные параметры, включая `cursor`, плюс значения настроек публичности). Курсор увеличивает число ключей (каждая страница - свой ключ), поэтому лимит 100 достигается быстрее, а вытеснение LRU обязательно. Сброс при изменении настроек и по `onChange` синхронизатора. Кэш хранит уже собранный публичный ответ, а не строки с причиной. Одинаковые параллельные запросы объединяются (single-flight).
- Задержка скрытия: запись, скрытая через `isHidden`, может оставаться видимой у клиентов до TTL серверного кэша плюс `max-age` плюс `stale-while-revalidate`, то есть 5 + 15 + 30 с, порядка 50 с. Серверный кэш обязан сбрасываться при изменении `isHidden` (требование к срезу админ-управления: операция скрытия вызывает инвалидацию кэша публичного слоя). Клиентская часть задержки (15 + 30 с) инвалидацией не сокращается.
- `s-maxage` для CDN не выставляется до решения владельца о CDN; браузерного `max-age=15` достаточно.

### 6.3 Контракт ошибок

| Код | Когда                                                                                          | Тело                                                           |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 400 | неверный query (неизвестный параметр, формат, диапазон, `from > to`, булево не `true`/`false`) | стандартное тело NestJS (`message: string[]`), без `code`      |
| 400 | курсор неверный, от другого `order` или другого набора фильтров                                | `code: 'punishments_invalid_cursor'`                           |
| 401 | `me` и персонал без токена                                                                     | стандартное тело, без `code`                                   |
| 403 | персонал без права                                                                             | стандартное тело, без `code`                                   |
| 403 | персонал без 2FA                                                                               | `code: 'admin_2fa_required'`                                   |
| 404 | раздел выключен                                                                                | `code: 'punishments_public_disabled'`                          |
| 404 | `ref` не найден, не публичен или вне формата                                                   | `code: 'punishments_not_found'`, одинаковое тело               |
| 429 | превышен throttle                                                                              | стандартное тело `ThrottlerException`, заголовок `Retry-After` |
| 503 | нет первичной загрузки нужных видов                                                            | `code: 'punishments_unavailable'`, `Retry-After: 60`           |

- `PunishmentErrorBody` (раздел 6) - это `ApiErrorBody` из `packages/shared/src/api/common.ts` (там `code?` необязателен) с обязательным `code` ТОЛЬКО для кодов модуля. Стандартные 400/401/403/429 могут идти без `code`; клиент ветвится по `statusCode`, а при наличии `code` - по нему.
- `Retry-After` на 429: `@nestjs/throttler` 5.2.0 в `apps/api` выставляет заголовок `Retry-After` при блокировке (`dist/throttler.guard.js`: `res.header` с именем `Retry-After` плюс суффикс именованного throttler, у безымянного суффикса нет). Это проверка по коду, а не запуском; контроллерный тест на 429 обязан проверить заголовок, при отсутствии это требование к реализации.

## 7. Синхронизация копий типов (R80)

`eslint` запрещает `apps/api` импортировать `@twomc/shared`, поэтому в API живёт локальная копия `apps/api/src/modules/punishments/api/punishments-api.types.ts` (текст значений и интерфейсов совпадает с shared), а `packages/shared/src/api/punishments.ts` потребляет web. Риск расхождения копий - R80 (`docs/implementation/RISKS.md`). Защита - контрактный тест `punishments-contract-sync.spec.ts` в `apps/api`:

1. Читает файлы как текст (`fs.readFileSync` по относительному пути; это не `import`, правило `no-restricted-imports` не нарушается): копию API, `packages/shared/src/api/punishments.ts`, `packages/shared/src/api/common.ts` (только объявления `IsoDateString` и `ApiErrorBody`), `apps/api/src/modules/punishments/punishment.types.ts` (виды и статусы) и `apps/api/prisma/schema.prisma` (enum `MinecraftPunishmentKind` и `MinecraftPunishmentStatus` как текст).
2. Разбирает TypeScript-файлы пакетом `typescript` (`ts.createSourceFile`, уже есть у проекта), собирает экспортируемые объявления (`interface`, `type`, `const`-массивы), нормализует печатью и сортирует по имени. Нормализуется: печать без комментариев, порядок объявлений, кавычки, trailing commas, строки `import`. Они не влияют на результат сравнения.
3. `IsoDateString`: в API-копии локальное объявление `export type IsoDateString = string;`, shared импортирует его из `./common`. При сравнении тип `IsoDateString` приравнивается к локальному объявлению, строка `import` игнорируется. Аналогично `ApiErrorBody` (нужен для `PunishmentErrorBody`): в API-копии локальное объявление БЕЗ `export`, текст которого сверяется с объявлением из `common.ts`.
4. Множества экспортируемых имён должны совпадать. Запрет API-only экспортов: допустим явный allowlist из одной строки - `IsoDateString`.
5. Значения `PUNISHMENT_KINDS` и `PUNISHMENT_VIEW_STATUSES` (плюс `DELETED_AT_SOURCE` у персонала) сверяются с `punishment.types.ts` и с enum Prisma `MinecraftPunishmentKind` и `MinecraftPunishmentStatus`, прочитанными из `schema.prisma` как текст.
6. При расхождении тест падает с перечнем различающихся имён.
7. Константы `PUNISHMENT_REASON_KEYS` и `PUNISHMENT_ERROR_CODES` берутся сервисами из копии в `apps/api` (одно место), а не перечисляются повторно.

Часть среза реализации: строка `export * from './api/punishments';` в `packages/shared/src/index.ts` (сейчас перечислены `./api/common` ... `./api/notifications`; `punishments` отсутствует).

Тест выполняется обычным jest-проектом api (в CI уже запускается). Альтернатива - генерация копии скриптом при сборке - отклонена: сборка api не должна зависеть от сборки shared.

## 8. Допущения и вопросы владельцу

Принято как допущения (до ответа, обратимо):

- Д1. Публичны только `BAN` и `MUTE`; WARN, KICK, silent и любые IP-баны (`ipBan = true`, даже с валидным ником) не публикуются (Q57/О1, Q31). Расхождение с дизайном: раздел 6 `LITEBANS-INTEGRATION-DESIGN.md` по умолчанию показывал silent; контракт следует О1 и скрывает silent.
- Д2. Права персонала - `users.punishments` (Q57/О3), просмотр пишется в `AuditLog` (2.5); отдельное `punishments.view` - Q63.
- Д3. «Мои наказания» показывают WARN, KICK, скрытые и silent записи; `DELETED_AT_SOURCE` не показывают; выдавшего, снявшего и причину снятия не показывают.
- Д4. Область (`scope`) публично не показывается и не фильтруется.
- Д5. Причина снятия и кто снял публично скрыты (Q58-2).
- Д6. Курсорная пагинация без общего `total`.
- Д7. WebSocket в этом срезе нет (4.6 отложен, раздел 9).

Вопросы владельцу (минимум):

- В1. Какие номера шаблонов LiteBans (`template`) соответствуют каким категориям (нужно из конфига LiteBans). Рекомендация: до ответа карта шаблонов пуста, публично действует только список точных формулировок и `rules`.
- В2. Какие формулировки на русском и английском модераторы реально вводят (для `phraseMap`). Рекомендация: стартовый список в коде, владелец дополняет.
- В3. Показывать игроку выдавшего в «Мои наказания»? Рекомендация: нет.
- В4. Снят (закрыт допущением Д4: публичная область не показывается). Нумерация не меняется.
- В5. Оформлен требованием: аудит просмотра персоналом (2.5), не вопрос.

Дополнительные вопросы владельцу: Q63 (ведёт chief).

## 9. Отложено

- WebSocket `/punishments` (4.6) отложен в срез 3b. Основание: (1) данные источника приходят пачками (опрос 1,5 с, статусы раз в 15 с, LiteBans обновляет `active` пачками), публичному списку не нужна секундная свежесть; достаточно опроса клиентом раз в 30-60 с с `If-None-Match` (304 дёшево); (2) публичная комната - новая неаутентифицированная поверхность (лимиты соединений, Origin, раздельные потоки Redis, отсутствие публичного `seq`), риск и объём выше самого списка; (3) скрытие записи должно приходить как `hidden`, а не `deleted` - безопаснее сначала проверить предикат `publicVisibilityWhere` на REST. Контракт уже несёт `ref` (у персонала ещё и `rev`), добавление WS аддитивно и REST не меняет. Синхронизатор уже отдаёт `onChange`.
- Скрытие и показ записи, заметки, настройки публичности, ручная пересверка, запись карты причин - срез админ-управления (отдельные права и `AuditLog`, дизайн 5.4).
- Обжалование зеркальных наказаний (`Report.appealedMinecraftPunishmentId`, миграция) - отдельный срез; поле `appealable` до него `false`.
- Страница `/bans` и «Мои наказания» в web - после утверждения контракта (фронтенд-срез; дизайн «Полдень»).

## 10. Тест-план (для среза реализации)

1. Форма публичного элемента: точный набор ключей при включённой и выключенной `showExecutor`; `executor` содержит ровно одно поле.
2. Корпус обходов очистки: публичный маппер всегда отдаёт ключ словаря (раздел 3.3).
3. Предикат публичности: каждая запись из списка исключений (WARN, KICK, silent, запись без ника, `isHidden`, `DELETED_AT_SOURCE`, ник с `[скрыто]`, ник длиннее 16, раздел выключен) не появляется ни в списке, ни в карточке; тела 404 идентичны.
4. `ipBan = true` с валидным ником не публикуется (ни в списке, ни в карточке; 404 как у остальных).
5. `ref`: переполнение (`ban-99999999999999999999`, `ban-9223372036854775808`), ведущий ноль, лишние символы - один и тот же 404 `punishments_not_found`; выборка по `ref` содержит `source = 'litebans'` и `sourceScope = 'default'`.
6. `me`: чужие записи недоступны, ник не используется, нет привязки - `linked:false`, `DELETED_AT_SOURCE` скрыт, WARN и KICK видны; в элементе нет `removedReason`.
7. Офлайн-UUID: привязка с uuid версии 3 даёт `linked:false` и пустой список (даже при наличии записей).
8. Персонал: 401 без токена, 403 без права, 403 `admin_2fa_required` без 2FA; в полях нет IP.
9. Аудит просмотра персоналом: список пишет в `AuditLog` нормализованные фильтры без тела выдачи; карточка - `ref` и `subjectUuid`.
10. Статус при чтении: ACTIVE с истёкшим `until` отдаётся как `EXPIRED` и попадает в `ended`.
11. Пагинация: курсор стабилен при вставках и при одинаковом `startedAt` у нескольких записей (второй ключ `id`); неверный курсор - 400 `punishments_invalid_cursor`; курсор от другого набора фильтров или другого `order` - 400; `limit` вне диапазона - 400.
12. Query: повторяющийся `kind` и одиночное значение приводятся к массиву; булевы `silent`, `ipBan`, `hidden` принимают только `true`/`false` (иное - 400); форматы `subjectUuid`, `nameExact`, `from`, `to`; `from > to` - 400, `from == to` допустим.
13. Поиск `name`: регистр, `_`, `%` и `\` буквально, длина 3-16; запрос не конкатенирует значения в SQL.
14. Недоступность: раздел выключен - 404; у любого нужного вида нет `initialSyncDoneAt` (в т.ч. строки `PunishmentSyncState` нет, «идёт загрузка») - 503 с `Retry-After`; данные есть и источник выключен - 200 с `stale: true`; самый старый `lastSuccessAt` из нескольких видов определяет `stale`. Порядок проверок раздела 5 (throttle, права, раздел выключен, валидация 400, `linked:false`, 503, 200).
15. Заголовки 6.1 для каждого эндпоинта и ответа 400/401/403/404/429/503.
16. ETag: `If-None-Match` - 304; `generatedAt` не меняет ETag; 304 не поверх ошибки (404, 503, 400 не кэшируются по ETag).
17. Задержка скрытия и сброс кэша: изменение `isHidden` инвалидирует серверный кэш; без инвалидации запись видна не дольше 5 + 15 + 30 с (раздел 6.2).
18. Кэш: вытеснение LRU при более чем 100 ключах (в т.ч. разные `cursor`).
19. Контрактный тест копий типов (раздел 7), включая сверку с `punishment.types.ts` и enum Prisma, запрет API-only экспортов.
20. `EXPLAIN` на одноразовой БД: индекс `lower("subjectName") text_pattern_ops` и частичный индекс используются для префиксного поиска и сортировки (в т.ч. generic plan); при отказе - запасной вариант (2.2).
21. Throttle: превышение лимита на `public` - 429 с `Retry-After`.
22. Конфликт имён и маршрутов: три новых контроллера, существующий `PunishmentsController` в reports не затронут.

Тесты запускаются на этапе реализации (`jest --runInBand`); при написании контракта ничего не запускалось.
