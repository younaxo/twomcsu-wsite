import {
  DEFAULT_CUTOFF_AT,
  DEFAULT_START_AT,
  DEFAULT_THRESHOLD_MINUTES,
  DEFAULT_TIMESTAMP_WINDOW_S,
  MAX_TIMESTAMP_WINDOW_S,
  SERVER_ID_PATTERN,
  isStrongMasterSecret,
} from './giveaway.constants';

export const GIVEAWAY_CONFIG = Symbol('GIVEAWAY_CONFIG');

export interface GiveawayConfig {
  /// `GIVEAWAY_ENABLED=true`; по умолчанию выключено.
  enabled: boolean;
  /// null, если не задан или слабый (приёмник отвечает 503).
  masterSecret: Buffer | null;
  /// Текущая версия ключей серверов.
  keyVersion: number;
  /// Принимать версию на единицу ниже текущей (ротация).
  acceptPreviousKey: boolean;
  timestampWindowS: number;
  /// `GIVEAWAY_CAPTCHA_ENABLED` (ADR-G002 п. 2.6); по умолчанию выключено.
  captchaEnabled: boolean;
  /// Админка и тестовый режим (ADR-G003). Не заданное = закрыто (fail closed).
  admin: GiveawayAdminConfig;
  defaults: {
    thresholdMinutes: number;
    startAt: Date;
    cutoffAt: Date;
    allowedServers: string[];
  };
}

export interface GiveawayAdminConfig {
  discordClientId: string | null;
  discordClientSecret: string | null;
  discordRedirectUri: string | null;
  /// Только цифровые Discord ID; пусто - вход закрыт.
  allowedDiscordIds: string[];
  /// Точный Origin админки (CSRF).
  origin: string;
  testModeEnabled: boolean;
  prizesDir: string;
}

export const DEFAULT_ADMIN_ORIGIN = 'https://admin.giveaway.twomc.su';
export const DEFAULT_PRIZES_DIR = '../../giveaway/prizes';

export interface EnvReader {
  get<T = string>(key: string): T | undefined;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === true || String(value).toLowerCase() === 'true';
}

function toInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function toDate(value: unknown, fallback: string): Date {
  const d = new Date(
    typeof value === 'string' && value !== '' ? value : fallback,
  );
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
}

function toStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function readGiveawayConfig(env: EnvReader): GiveawayConfig {
  const rawSecret = env.get<string>('GIVEAWAY_MASTER_SECRET');
  const secret =
    typeof rawSecret === 'string' ? Buffer.from(rawSecret, 'utf8') : null;
  const servers = String(env.get('GIVEAWAY_ALLOWED_SERVERS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => SERVER_ID_PATTERN.test(s));
  return {
    enabled: toBoolean(env.get('GIVEAWAY_ENABLED'), false),
    masterSecret:
      secret !== null && isStrongMasterSecret(secret) ? secret : null,
    keyVersion: toInt(env.get('GIVEAWAY_KEY_VERSION'), 1, 1, 999_999),
    acceptPreviousKey: toBoolean(env.get('GIVEAWAY_ACCEPT_PREVIOUS_KEY'), true),
    timestampWindowS: toInt(
      env.get('GIVEAWAY_TIMESTAMP_WINDOW_S'),
      DEFAULT_TIMESTAMP_WINDOW_S,
      5,
      MAX_TIMESTAMP_WINDOW_S,
    ),
    captchaEnabled: toBoolean(env.get('GIVEAWAY_CAPTCHA_ENABLED'), false),
    admin: {
      discordClientId: toStr(env.get('GIVEAWAY_DISCORD_CLIENT_ID')),
      discordClientSecret: toStr(env.get('GIVEAWAY_DISCORD_CLIENT_SECRET')),
      discordRedirectUri: toStr(env.get('GIVEAWAY_DISCORD_REDIRECT_URI')),
      allowedDiscordIds: [
        ...new Set(
          String(env.get('GIVEAWAY_ADMIN_DISCORD_IDS') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[0-9]{5,32}$/.test(s)),
        ),
      ],
      origin: (
        toStr(env.get('GIVEAWAY_ADMIN_ORIGIN')) ?? DEFAULT_ADMIN_ORIGIN
      ).replace(/\/+$/, ''),
      testModeEnabled: toBoolean(env.get('GIVEAWAY_TEST_MODE_ENABLED'), false),
      prizesDir: toStr(env.get('GIVEAWAY_PRIZES_DIR')) ?? DEFAULT_PRIZES_DIR,
    },
    defaults: {
      thresholdMinutes: toInt(
        env.get('GIVEAWAY_THRESHOLD_MINUTES'),
        DEFAULT_THRESHOLD_MINUTES,
        1,
        1_000_000,
      ),
      startAt: toDate(env.get('GIVEAWAY_START_AT'), DEFAULT_START_AT),
      cutoffAt: toDate(env.get('GIVEAWAY_CUTOFF_AT'), DEFAULT_CUTOFF_AT),
      allowedServers: [...new Set(servers)],
    },
  };
}

export function isGiveawayOperational(config: GiveawayConfig): boolean {
  return config.enabled && config.masterSecret !== null;
}
