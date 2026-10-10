# Контракт Minecraft-плагина twomc.su: `/site-connect` (ADR-0072)

Привязка Minecraft-аккаунта при регистрации на сайте. API сайта готов; сам
плагин для серверов TwoMC (Paper/Spigot, Java) — отдельная работа.

## Сценарий

1. Игрок регистрируется на twomc.su и подтверждает e-mail кодом из письма.
2. В игре вводит `/site-connect` → плагин вызывает `POST /minecraft/plugin/site-connect`
   и отправляет игроку в чат кликабельную ссылку `url` из ответа (действует 10 минут).
3. Игрок открывает ссылку — сайт показывает одноразовый код привязки `XXX-000-X0X0-0X0` (16 символов с дефисами).
4. Игрок вставляет его в регистрацию — сайт показывает код подтверждения `X0XX0` (5 символов).
5. В игре вводит `/site-connect <код>` → плагин вызывает
   `POST /minecraft/plugin/site-connect/confirm` и пишет в чат `message` из ответа.
6. Сайт видит подтверждение и даёт создать аккаунт; UUID привязывается к нему.

Ник игрока обязан совпадать с ником регистрации (без учёта регистра). Один
UUID — один аккаунт twomc.su.

## Подпись запросов

Секрет `MINECRAFT_PLUGIN_SECRET` (≥ 32 символа) — одинаковый в env сайта и в
конфиге плагина. Не коммитить, не логировать.

Заголовки каждого запроса:

| Заголовок | Значение |
|---|---|
| `x-twomc-timestamp` | Unix-время в секундах (расхождение с сервером ≤ 60 с) |
| `x-twomc-signature` | hex(HMAC-SHA256(secret, canonical)) |
| `content-type` | `application/json` |

`canonical` — строка из четырёх строк через `\n`:

```
<timestamp>
POST
<path без домена и query, например /minecraft/plugin/site-connect>
<поля тела по алфавиту: key=value через &>
```

Пример для тела `{"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","name":"Notch"}`:

```
1760054400
POST
/minecraft/plugin/site-connect
name=Notch&uuid=069a79f4-44e9-4726-a5be-fca90e38aaf5
```

Эталонная реализация подписи — `apps/api/src/modules/minecraft-link/plugin-signature.guard.ts`
(`signPluginRequest`), имитатор плагина — `pnpm --filter @twomc/api mc:plugin-sim`.

## Эндпоинты

### `POST /minecraft/plugin/site-connect`

Тело: `{ "uuid": "<UUID игрока>", "name": "<ник>" }`.
Ответ 200: `{ "url": "https://twomc.su/site-connect/<token>", "expiresAt": "<ISO>" }`.
429 — больше 6 запросов на UUID в час. 401 — неверная подпись/время. 503 —
интеграция выключена (нет секрета).

### `POST /minecraft/plugin/site-connect/confirm`

Тело: `{ "uuid": "...", "name": "...", "code": "<X0XX0>" }`.
Ответ 200: `{ "status": "confirmed" | "invalid" | "expired" | "attempts" | "not_found",
"message": "<текст для чата на русском>", "attemptsLeft"?: number }`.
Код действует 5 минут, 5 попыток; регистр и пробелы не важны.

## Безопасность

- Коды генерирует только сервер (`crypto.randomInt`; `X` — A–Z, `0` — 0–9; ADR-0092),
  хранятся только HMAC, одноразовые, с TTL и лимитом попыток.
- Ссылка одноразовая по смыслу: каждое открытие выдаёт новый 15-символьный код,
  после принятия кода ссылка недействительна.
- Плагин не должен логировать коды и ссылки целиком.
