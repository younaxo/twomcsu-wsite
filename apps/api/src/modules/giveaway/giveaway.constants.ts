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

/// Фаза 2 (ADR-G002): подписанные пути плагина. Ключ - путь запроса (с `/api`
/// и без), значение - публичный путь, который подписывается всегда.
export const GIVEAWAY_REDEEM_PATH = '/api/giveaway/v1/redeem';
export const GIVEAWAY_PROGRESS_PATH = '/api/giveaway/v1/progress';
export const GIVEAWAY_SIGNED_PATHS: Readonly<Record<string, string>> = {
  '/api/giveaway/v1/events': GIVEAWAY_SIGN_PATH,
  '/giveaway/v1/events': GIVEAWAY_SIGN_PATH,
  '/api/giveaway/v1/redeem': GIVEAWAY_REDEEM_PATH,
  '/giveaway/v1/redeem': GIVEAWAY_REDEEM_PATH,
  '/api/giveaway/v1/progress': GIVEAWAY_PROGRESS_PATH,
  '/giveaway/v1/progress': GIVEAWAY_PROGRESS_PATH,
};

/// Коды: алфавит Crockford без I, L, O, U (32 символа), 16 символов = 80 бит.
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16;
export const CODE_TTL_S = 600;
export const SESSION_COOKIE = 'gw_session';
export const SESSION_COOKIE_MAX_AGE_S = 86_400;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const COOKIE_PATH = '/api/giveaway';

/// Билет: буква без I и O (24) + три цифры.
export const TICKET_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const TICKET_MAX_ATTEMPTS = 8;

/// Лимиты (ADR-G002 п. 2.5, 4, 6.1, 6.2).
export const CODES_PER_SUBNET_HOUR = 30;
export const CODES_PER_IP_HOUR = 15;
export const CODES_PER_SESSION_10MIN = 10;
export const STATUS_PER_SESSION_MIN = 60;
export const PUBLIC_PER_IP_MIN = 120;
export const REDEEM_PER_UUID_MIN = 10;
/// Основная защита - лимит по UUID; лимит на сервер лишь страховка от потока
/// (ADR-G002 п. 6.1), поэтому высокий: спам нескольких игроков не блокирует всех.
export const REDEEM_PER_SERVER_MIN = 600;
export const MAX_PROGRESS_UUIDS = 100;

/// Фаза 3 (ADR-G003): админка, итоги, эфир.
export const ADMIN_COOKIE = 'gw_admin';
export const ADMIN_OAUTH_COOKIE = 'gw_admin_oauth';
export const ADMIN_COOKIE_PATH = '/api/giveaway/v1';
export const ADMIN_OAUTH_COOKIE_PATH = '/api/giveaway/v1/admin/auth';
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const ADMIN_OAUTH_TTL_S = 600;
export const ADMIN_LOGIN_PER_10MIN = 20;
export const ADMIN_API_PER_MIN = 300;
export const ADMIN_CSRF_HEADER = 'x-giveaway-csrf';
export const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_TIMEOUT_MS = 8000;

export const DRAW_CONFIRM_PHRASE = 'РАССЧИТАТЬ';
export const STREAM_CHANNEL = 'giveaway:stream';
export const STREAM_HEARTBEAT_MS = 15_000;
export const STREAM_MAX_PER_IP = 6;
export const STREAM_OPEN_PER_MIN = 60;
export const TEST_MAX_MINUTES_PER_NAME = 1_000_000;
export const PRIZE_IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.png$/;
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;
export const SNAPSHOT_HASH_PATTERN = /^[0-9a-f]{64}$/;
