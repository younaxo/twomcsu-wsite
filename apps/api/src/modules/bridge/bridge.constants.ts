/// Константы протокола Bridge v1 (`docs/stage-03/BRIDGE-CONTRACT.md`).
/// Файл без зависимостей от Nest: его переиспользуют симулятор и тесты.

export const BRIDGE_SCHEMA = 'twomc.bridge.v1';
export const BRIDGE_PROTOCOL = 1;
export const BRIDGE_SIGNATURE_PREFIX = 'twomc-bridge-v1';

/// Единый формат slug сервера (2.4 контракта): он же `serverId` протокола и
/// соль HKDF. Точка запрещена, чтобы не ломать разбор `key-id`.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

export const HEADER_KEY_ID = 'x-twomc-key-id';
export const HEADER_TIMESTAMP = 'x-twomc-timestamp';
export const HEADER_NONCE = 'x-twomc-nonce';
export const HEADER_PROTOCOL = 'x-twomc-protocol';
export const HEADER_SIGNATURE = 'x-twomc-signature';

export const PATH_HANDSHAKE = '/bridge/v1/handshake';
export const PATH_EVENTS = '/bridge/v1/events';

/// Допустимые пары «метод и путь» среза 1 (сверка `snapshot` — срез 2).
export const ALLOWED_ROUTES: ReadonlyMap<string, string> = new Map([
  [PATH_HANDSHAKE, 'GET'],
  [PATH_EVENTS, 'POST'],
]);

/// Формат заголовков проверяется до любых обращений к Redis и БД (2.3, п. 0).
export const KEY_ID_PATTERN = /^[a-z0-9-]{1,32}\.[0-9]{1,6}$/;
export const TIMESTAMP_PATTERN = /^[0-9]{10}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,43}$/;
export const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

/// Нонс живёт дольше окна времени с запасом (2.3, п. 6).
export const NONCE_TTL_S = 180;

export const MAX_EVENTS_PER_BATCH = 100;
export const MAX_EVENT_DATA_BYTES = 16 * 1024;
/// Границы `occurredAt` (5.3): [сейчас - 7 суток, сейчас + 60 с].
export const OCCURRED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OCCURRED_MAX_FUTURE_MS = 60 * 1000;

/// Журнал дедупликации хранится не меньше 7 суток (7.1 контракта).
export const MIN_LOG_RETENTION_DAYS = 7;

export const DEFAULT_TIMESTAMP_WINDOW_S = 60;
export const DEFAULT_MAX_BODY_BYTES = 262_144;
export const DEFAULT_KEY_OVERLAP_DAYS = 7;
export const DEFAULT_APPLY_LATENCY_LIMIT_MS = 2000;
/// Минимальная длина мастер-секрета в байтах (UTF-8 строки из окружения).
export const MIN_MASTER_SECRET_BYTES = 32;

/// Закрытый список возможностей сервера (2.4 контракта).
export const CAPABILITY_KEYS = [
  'punishments',
  'punishments-authoritative',
  'player-events',
] as const;
export type BridgeCapability = (typeof CAPABILITY_KEYS)[number];
