import type { RedisService } from './redis.service';

/// Лимиты событий WebSocket (ADR-0123): глобальный `ThrottlerGuard` действует
/// только на HTTP, сокет мог слать события без ограничений. Фиксированное
/// окно в Redis по пространству имён, группе событий и пользователю.
export const WS_LIMITS = {
  /// Новые сообщения.
  send: { limit: 10, windowSec: 10 },
  /// Правка, удаление, реакции, прочтение.
  mutate: { limit: 20, windowSec: 10 },
  /// «Печатает…» — рассылается всем в комнате.
  typing: { limit: 10, windowSec: 10 },
  /// Вход и выход из комнат.
  room: { limit: 30, windowSec: 10 },
} as const;

export type WsLimitGroup = keyof typeof WS_LIMITS;

export const WS_RATE_MESSAGE = 'Слишком часто — подождите несколько секунд.';

export const wsRateKey = (
  namespace: string,
  group: WsLimitGroup,
  userId: string,
) => `ws:rate:${namespace}:${group}:${userId}`;

/// true — событие можно обработать. Окно ставится атомарно вместе со
/// счётчиком (SET NX EX + INCR в MULTI): ключ без TTL не остаётся.
export async function wsAllowed(
  redis: RedisService,
  namespace: string,
  group: WsLimitGroup,
  userId: string,
): Promise<boolean> {
  const { limit, windowSec } = WS_LIMITS[group];
  const key = wsRateKey(namespace, group, userId);
  const results = await redis.client
    .multi()
    .set(key, '0', 'EX', windowSec, 'NX')
    .incr(key)
    .exec();
  const count = Number(results?.[1]?.[1] ?? 0);
  return count <= limit;
}
