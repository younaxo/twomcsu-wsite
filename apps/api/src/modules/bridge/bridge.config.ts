import {
  DEFAULT_APPLY_LATENCY_LIMIT_MS,
  DEFAULT_BODY_READ_TIMEOUT_MS,
  DEFAULT_KEY_OVERLAP_DAYS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_TIMESTAMP_WINDOW_S,
  isStrongMasterSecret,
} from './bridge.constants';

export const BRIDGE_CONFIG = Symbol('BRIDGE_CONFIG');

export interface BridgeConfig {
  /// `BRIDGE_ENABLED=true`; пустое и незаданное значение — выключено.
  enabled: boolean;
  /// Байты UTF-8 строки `BRIDGE_MASTER_SECRET`; null, если не задан или
  /// слабый: короче 32 байт или менее 16 различных байт (приёмник при этом отвечает 503).
  masterSecret: Buffer | null;
  timestampWindowS: number;
  maxBodyBytes: number;
  keyOverlapDays: number;
  applyLatencyLimitMs: number;
  /// Дедлайн чтения тела запроса парсером, мс.
  bodyReadTimeoutMs: number;
  /// `BRIDGE_DELIVERY_ENABLED=true`: выдача заказов через Bridge (0.13).
  /// По умолчанию выключена; без неё claim/ack отвечают 503.
  deliveryEnabled: boolean;
}

export interface EnvReader {
  get<T = string>(key: string): T | undefined;
}

function toBoolean(value: unknown): boolean {
  return value === true || String(value ?? '').toLowerCase() === 'true';
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function readBridgeConfig(env: EnvReader): BridgeConfig {
  const rawSecret = env.get<string>('BRIDGE_MASTER_SECRET');
  const secret =
    typeof rawSecret === 'string' ? Buffer.from(rawSecret, 'utf8') : null;
  return {
    enabled: toBoolean(env.get('BRIDGE_ENABLED')),
    masterSecret:
      secret !== null && isStrongMasterSecret(secret) ? secret : null,
    timestampWindowS: toPositiveInt(
      env.get('BRIDGE_TIMESTAMP_WINDOW_S'),
      DEFAULT_TIMESTAMP_WINDOW_S,
    ),
    maxBodyBytes: toPositiveInt(
      env.get('BRIDGE_MAX_BODY_BYTES'),
      DEFAULT_MAX_BODY_BYTES,
    ),
    keyOverlapDays: toPositiveInt(
      env.get('BRIDGE_KEY_OVERLAP_DAYS'),
      DEFAULT_KEY_OVERLAP_DAYS,
    ),
    applyLatencyLimitMs: toPositiveInt(
      env.get('BRIDGE_APPLY_LATENCY_LIMIT_MS'),
      DEFAULT_APPLY_LATENCY_LIMIT_MS,
    ),
    bodyReadTimeoutMs: toPositiveInt(
      env.get('BRIDGE_BODY_READ_TIMEOUT_MS'),
      DEFAULT_BODY_READ_TIMEOUT_MS,
    ),
    deliveryEnabled: toBoolean(env.get('BRIDGE_DELIVERY_ENABLED')),
  };
}

/// Приёмник работает только при включённом флаге И корректном секрете.
export function isBridgeOperational(config: BridgeConfig): boolean {
  return config.enabled && config.masterSecret !== null;
}
