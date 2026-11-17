# Отчёт: Q51, скрытие модератора в уведомлениях автору обращения

## 1. Итог

Решение владельца Q51 (а): отправитель уведомлений автору обращения — система. ADR-0175, риск R44.

## 2. Места уведомлений автору по действиям персонала

Единственная точка: `ReportsModerationService.notifyAuthor` (`apps/api/src/modules/reports/reports-moderation.service.ts`). Вызывается из `changeStatus` (REPORT_STATUS_CHANGED), `setVerdict` (REPORT_VERDICT), `addMessage` (SYSTEM, «Новый ответ»). Других уведомлений автору по действиям персонала в `reports`/`notifications` нет. Из `fromUserId: actorId` в этом файле остался только вызов `assign` (адресат — персонал), не менялся.

## 3. Что изменено

- `notifyAuthor` не передаёт `fromUserId`; payload: userId, type, title, message (метка статуса), link, metadata.reportNumber. Без `fromUserId` в `NotificationsService` `fromUser` = null, push-превью без имени. Образец: системные вызовы без `fromUserId` (`communications/announcements.service.ts`).
- Web не менялся: при пустом `fromUser` отправитель не рисуется, блок «Системное» уже показывается для типа SYSTEM. Если владелец хочет «Система» и у REPORT_STATUS_CHANGED/REPORT_VERDICT, нужно расширить `isSystemMessage` (`apps/web/src/components/notifications/system-sender.tsx`), это отдельное решение.
- Тесты: unit в `reports-moderation.service.spec.ts` (три действия без данных модератора с точным набором ключей; персоналу `fromUserId` сохранён); e2e `apps/api/test/reports-support.e2e-spec.ts` дописан статически (`fromUserId` null, id модератора нет в записи), не запускался.

## 4. Находки вне Q51 (п.5)

Внутри обращения модератор автору не раскрывается: сообщения персонала отдаются с `authorId: null` (`reports.service.ts:304-306`), служебные поля вырезаны (`reports.service.ts:49-80`), история автора санитизирована (`reports.service.ts:312-358`). Раскрытия не найдено, ничего не исправлялось. Остаточное: старые уведомления с `fromUserId` в БД (R44).

## 5. Вопрос владельцу

Занулить `fromUserId` у прежних уведомлений авторам (миграция данных) или скрывать `fromUser` при чтении для этих типов? См. R44.

## 6. Web: подпись «Системное» (дополнение)

`isSystemMessage` (`apps/web/src/components/notifications/system-sender.tsx`) теперь истинна для типа SYSTEM (как раньше, ADR-0080) и для REPORT_STATUS_CHANGED / REPORT_VERDICT / SYSTEM со ссылкой `/support/` — правило API (`report-author-privacy.ts`), в `packages/shared` его нет, поэтому продублировано локально с комментарием-ссылкой. SYSTEM без `/support/` оставлен системным, иначе сломался бы ADR-0080. Тесты: `system-sender.test.ts`.
