# 49 — Coverage Report

> **Документация НЕ завершена.** Ниже — сверка найденного и документированного. Числа посчитаны повторным поиском декораторов в коде (§84 задания) и разбором сгенерированных документов.

## Сверка
| Объект | Найдено в коде | Документировано | Совпадает |
|---|---|---|---|
| Controller-классы | 73 | 73 (04) | да |
| HTTP endpoints | 497 | 497 (04) / 497 (05) | да |
| Prisma models | 105 | 105 (07) | да |
| Prisma enums | 51 | 51 (07) | да |
| Frontend pages | 143 | 143 (03) | да |
| WS client→server events | 19 | 19 (06) | да |

## Checklist
- [x] controllers scanned (73 классов, 497 endpoints)
- [~] services scanned — точечно: auth, brute-force, captcha, uploads, audit, orders (quickBuy/mockComplete), monitoring, voting, markdown, link-preview; остальные не прочитаны полностью
- [x] Prisma schema scanned (105 моделей, 51 enum)
- [ ] migrations scanned (41) — не анализировались
- [x] web pages scanned (143; статически: guards, хуки, API-вызовы из страниц и хуков)
- [~] hooks scanned — только для сопоставления с API; 37-FRONTEND-API-MAP не написан
- [~] stores scanned — перечислены, не разобраны
- [ ] shared package scanned — частично (user.ts); экспорты не каталогизированы
- [x] websocket scanned (3 gateway)
- [x] env scanned
- [x] docker scanned

## Статус документов
Написаны: 00, 01, 03, 04, 05, 06, 07, 08, 09, 10, 11, 25, 26, 28, 29, 31, 32, 33, 42, 43, 44, 45, 46, 47, 49.
Не написаны: 02-FRONTEND, 12-USERS-PROFILES, 13-SOCIAL, 14-CHAT, 15-DIRECT-MESSAGES, 16-NOTIFICATIONS, 17-NEWS, 18-CONTENT-SYSTEMS, 19-FORMS, 20-REPORTS-MODERATION, 21-STORE, 22-MINECRAFT-SERVERS, 23-GAMIFICATION, 24-ADMIN-PANEL, 27-SYSTEM, 30-ERROR-HANDLING, 34-DEPENDENCIES, 35-FEATURE-CATALOG, 36-CODE-MAP, 37-FRONTEND-API-MAP, 38-DATA-FLOWS, 39-BUSINESS-RULES, 40-VALIDATION, 41-STATE-MACHINES, 48-MASTER-SPEC.

## Ограничения
- В 04 поля Response/Errors частично шаблонные: формат ответа берётся из аннотации возвращаемого типа, бизнес-ошибки (404/409) — в сервисах.
- Колонка API в 03 не включает вызовы из src/components/**.
- Permission keys в 11 — автогенерация, нужен ревью.
- Вывод «Auth = NONE → публичный» статический; глобально подключён только ThrottlerGuard (app.module.ts), модульных auth-guard'ов вне контроллеров не найдено.
