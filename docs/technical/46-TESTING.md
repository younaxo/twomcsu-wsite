# 46 — Тестирование

Текущее состояние: тестов нет (`*.spec.ts`, `*.test.ts`, e2e-конфигов не найдено), CI нет. Скрипты: `lint`, `typecheck`.
## Рекомендуемый стек
API: Jest + Supertest + отдельная тестовая БД (Prisma migrate) и Redis; Web: Vitest + Testing Library, Playwright для e2e; WS: `socket.io-client` в Jest.
## Обязательные наборы
- **Auth:** register (дубликаты/гонка), login (captcha после 3, блок после 10, бан), refresh (rotation, reuse detection → revoke all, бан), reset (токен одноразовый, TTL), logout all.
- **Permissions (когда появятся):** без права → 403; с правом → успех; superuser → успех; низшая роль не может изменять высшую; нельзя выдать недоступное себе permission; отзыв права действует немедленно (инвалидация кеша).
- **Privilege escalation:** bulk ban выше себя, назначение роли выше себя, редактирование protected system role, `#0`.
- **Users/Profile:** privacy-флаги (`hide*`, `profileVisibility`), `username` неизменяем.
- **Store:** цена/скидки/промокод/округление (`quickBuy`, `create`), переходы статусов, отсутствие mock-оплаты в prod.
- **Forms/Reports:** валидация полей, загрузка, статусы.
- **Uploads/CDN:** MIME spoofing, лимиты, traversal, SVG, GIF, удаление, orphan.
- **WebSocket:** auth (нет токена/бан), `conversation:join` чужой беседы, `join_channel`, anti-spam, mute/ban.
- **Server monitoring:** сервис мониторинга с мок-ответом `minecraft-server-util`, очистка логов.
