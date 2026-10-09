# 06 — WebSocket (Socket.IO)

Библиотека: `@nestjs/platform-socket.io` / `@nestjs/websockets` (Socket.IO). Gateways: **3**, `@SubscribeMessage` handlers: **19** (client→server). Серверные emit-события перечислены ниже. Источники: `apps/api/src/modules/chat/chat.gateway.ts` (288 строк), `apps/api/src/modules/direct-messages/direct-messages.gateway.ts` (222), `apps/api/src/modules/notifications/notifications.gateway.ts` (86). Frontend: `apps/web/src/hooks/useSocket.ts`, `useChat.ts`, `useDirectMessagesSocket.ts`, `useNotificationSocket.ts`.

## Общая модель аутентификации (во всех трёх namespaces)
1. Токен берётся из `client.handshake.auth.token` либо из заголовка `Authorization: Bearer`.
2. `JwtService.verifyAsync(token, { secret: jwt.accessSecret })`; при ошибке/отсутствии токена → `client.disconnect(true)`.
3. Пользователь загружается из БД; если `isBanned` → disconnect (в `chat` дополнительно эмитится `user:banned` перед disconnect).
4. Сокет присоединяется к личной комнате. Права на отдельные события проверяются **внутри сервисов** (по `roleGroup` пользователя), а не декораторами.
5. Rate limit на уровне gateway **не настроен** (`ThrottlerGuard` для WS не подключён); анти-спам для чата — `AntiSpamService` (см. 14-CHAT.md, в работе).
6. Токен проверяется только при подключении: истёкший access-токен уже открытое соединение не разрывает.

CORS: `chat` и `notifications` — через `cors: {...}` (origin из конфигурации), `messages` — `cors: { origin: true, credentials: true }` (**любой origin**, см. 29-SECURITY.md).

## Namespace `/chat`
Rooms: `user:{userId}` (личная), `channel:{channelId}`.

| Direction | Event | Namespace | Payload (DTO) | Permission | Description |
|---|---|---|---|---|---|
| C→S | `join_channel` | /chat | `ChannelIdDto` | любой авторизованный; **наличие канала/доступ не проверяется** | join `channel:{id}`, `MessagesService.setOnline`, broadcast `user:online` |
| C→S | `leave_channel` | /chat | `ChannelIdDto` | auth | leave room, broadcast `user:offline` |
| C→S | `send_message` | /chat | `SendMessageDto` | `channel.isReadOnly`/`minRoleGroup` (по умолчанию `MODERATOR` для readonly) проверяет `MessagesService` | создать сообщение → `message:new` в комнату |
| C→S | `edit_message` | /chat | `EditMessageDto` | автор/staff (в `MessagesService`) | → `message:edited` |
| C→S | `delete_message` | /chat | `MessageIdDto` & … | автор/staff | → `message:deleted` |
| C→S | `typing_start` | /chat | `ChannelIdDto` | auth | → `user:typing` (всем кроме отправителя) |
| C→S | `typing_stop` | /chat | `ChannelIdDto` | auth | → `user:stopped_typing` |
| C→S | `pin_message` | /chat | `MessageIdDto` & {unpin?} | staff (в сервисе) | → `message:pinned` / `message:unpinned` |
| C→S | `mute_user` | /chat | `MuteUserDto` | `ModerationService.muteUser(actorId, roleGroup, dto)` | → `user:muted` (в комнату канала либо **всем** сокетам namespace, если `channelId` не задан, + личная комната цели) |
| C→S | `ban_user` | /chat | `BanUserDto` | `ModerationService.banUser(...)` | → `user:banned` **всем** сокетам namespace; сокеты цели отключаются |
| S→C | `message:new`, `message:edited`, `message:deleted`, `message:pinned`, `message:unpinned` | /chat | сообщение (`ChatMessage` из `@twomc/shared`) | — | broadcast в `channel:{id}` |
| S→C | `user:online`, `user:offline`, `user:typing`, `user:stopped_typing` | /chat | `{ userId, username, channelId }` | — | presence/typing |
| S→C | `user:muted`, `user:banned` | /chat | mute/ban DTO | — | см. выше |
| S→C | `achievement:unlocked` | /chat | payload достижения | — | в `user:{id}`; вызывается сервером через публичный метод gateway |
| S→C | произвольное событие (`this.server.emit(event, payload)`) | /chat | любой | — | публичный метод gateway для серверных рассылок (строка ~270) |

## Namespace `/messages` (личные сообщения)
Rooms: `messages:user:{userId}`, `messages:conversation:{conversationId}`. При подключении сокет **автоматически** входит во все комнаты своих `conversation` (по membership).

| Direction | Event | Namespace | Payload (DTO) | Permission | Description |
|---|---|---|---|---|---|
| C→S | `conversation:join` | /messages | `ConversationSocketDto` | `messages.requireMember(conversationId, userId)` | join комнаты беседы |
| C→S | `conversation:leave` | /messages | `ConversationSocketDto` | auth | leave комнаты |
| C→S | `message:send` | /messages | `ConversationSocketDto & SendDirectMessageDto` | участник беседы (в сервисе) | ack `{ ok, message }` / `{ ok:false, error }`; → `message:new` |
| C→S | `message:edit` | /messages | edit DTO | автор | → `message:updated` |
| C→S | `message:delete` | /messages | id DTO | автор | → `message:updated` (soft delete: `row.isDeleted`) |
| C→S | `message:react` | /messages | reaction DTO | участник | → `message:updated` |
| C→S | `conversation:read` | /messages | `ConversationSocketDto & MarkConversationReadDto` | участник | → `conversation:read` (receipt) |
| C→S | `typing:start` / `typing:stop` | /messages | `ConversationSocketDto` | участник | → `typing:start` / `typing:stop` остальным |
| S→C | `message:new`, `message:updated`, `conversation:updated`, `conversation:read` | /messages | message / receipt | — | в `messages:conversation:{id}` |
| S→C | `conversation:changed` | /messages | `{ conversationId }` | — | в `messages:conversation:{id}` и в личные комнаты участников (`messages:user:{id}`) для обновления списка |

## Namespace `/notifications`
Rooms: личная комната пользователя (`userRoom(userId)`).

| Direction | Event | Namespace | Payload | Permission | Description |
|---|---|---|---|---|---|
| C→S | — (handlers отсутствуют) | /notifications | — | — | namespace только серверный |
| S→C | `notification:new` | /notifications | `Notification` (shared) | — | `NotificationsGateway.emitToUser(userId, notification)` из `NotificationsService` |
| S→C | `notification:changed` | /notifications | `{ unreadCount: number }` | — | `NotificationsGateway.emitChanged` после создания, прочтения/непрочтения, удаления, «прочитать все», «удалить прочитанные», «очистить» (ADR-0074) |

## Reconnect / offline
- Клиентская логика reconnect — стандартная Socket.IO; серверного буфера пропущенных событий нет. Пропущенные данные восстанавливаются повторным REST-запросом (React Query invalidation на фронте — см. 02-FRONTEND.md, в работе).
- Presence в чате хранится в Redis (`chat:online:{channelId}`, `chat:typing:{channelId}`, см. 28-CACHE-REDIS.md).

## Статистика
Namespaces: 3. Client→server events: 19 (chat 10, messages 9, notifications 0; сверено с `@SubscribeMessage`). Список server→client событий приведён в таблицах выше; общий их счёт не пересчитывался.

## Замечания по безопасности (подробнее в 29-SECURITY.md)
- `join_channel` не проверяет существование канала и доступ; `setOnline` пишет в Redis для произвольного `channelId`.
- `ban_user` / `mute_user` без `channelId` рассылают событие всем сокетам namespace (включая причину бана).
- `/messages` разрешает CORS с любого origin.
