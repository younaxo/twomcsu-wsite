/// Константы протокола событий розыгрыша «Анархия Новой Эры» (фаза 1).
/// Файл без зависимостей от Nest. Контракт: giveaway/docs/ADR-G001-session-time-counting.md.

export const GIVEAWAY_SCHEMA = 'twomc.giveaway.v1';
export const GIVEAWAY_SIGNATURE_PREFIX = 'twomc-giveaway-v1';
/// Путь, который плагин подписывает ВСЕГДА (публичный путь). Приложение
/// принимает и вариант без `/api` (если прокси срезает префикс), но подпись
/// считается по этому значению.
export const GIVEAWAY_SIGN_PATH = '/api/giveaway/v1/events';
export const GIVEAWAY_ROUTES: readonly string[] = [
  '/api/giveaway/v1/events',
  '/giveaway/v1/events',
];

/// Префиксы путей (в нижнем регистре) для парсера тела.
export const GIVEAWAY_PATH_PREFIXES: readonly string[] = [
  '/api/giveaway/v1',
  '/giveaway/v1',
];

export const HEADER_KEY_ID = 'x-giveaway-key-id';
export const HEADER_TIMESTAMP = 'x-giveaway-timestamp';
export const HEADER_NONCE = 'x-giveaway-nonce';
export const HEADER_SIGNATURE = 'x-giveaway-signature';

/// `<id сервера>.<версия ключа>`.
export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}\.[0-9]{1,6}$/;
export const TIMESTAMP_PATTERN = /^[0-9]{10}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,43}$/;
export const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

export const DEFAULT_TIMESTAMP_WINDOW_S = 300;
export const MAX_TIMESTAMP_WINDOW_S = 300;
export const MAX_BODY_BYTES = 65_536;
export const MAX_EVENTS_PER_BATCH = 100;

/// occurredAt: не позже «сейчас + 120 с» и не старше 72 часов.
export const OCCURRED_MAX_FUTURE_MS = 120 * 1000;
export const OCCURRED_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/// Лимиты на сервер.
export const REQUESTS_PER_MINUTE = 120;
export const EVENTS_PER_MINUTE = 3000;

export const MIN_MASTER_SECRET_BYTES = 32;
export const MIN_MASTER_SECRET_DISTINCT_BYTES = 16;

export function isStrongMasterSecret(secret: Buffer): boolean {
  return (
    secret.length >= MIN_MASTER_SECRET_BYTES &&
    new Set(secret).size >= MIN_MASTER_SECRET_DISTINCT_BYTES
  );
}

/// Значения по умолчанию (UTC). 22.11.2026 00:00 МСК = 21.11.2026 21:00 UTC;
/// 30.12.2026 23:59:59 МСК = 30.12.2026 20:59:59 UTC (МСК = UTC+3 без перехода).
export const DEFAULT_START_AT = '2026-11-21T21:00:00.000Z';
export const DEFAULT_CUTOFF_AT = '2026-12-30T20:59:59.000Z';
export const DEFAULT_THRESHOLD_MINUTES = 3000;
export const GIVEAWAY_TIMEZONE = 'Europe/Moscow';
