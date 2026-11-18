/// Настройки синхронизации наказаний (раздел 2.3 дизайна). Читаются из env;
/// секретов здесь нет, значения по умолчанию — только для числовых границ.

export interface PunishmentsConfig {
  /// `LITEBANS_ENABLED`; по умолчанию выключено.
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  activeCheckIntervalMs: number;
  reconcileIntervalMs: number;
  /// Перекрытие окна опроса по id (защита от транзакций, фиксируемых не по
  /// порядку id).
  overlap: number;
}

export interface EnvReader {
  get<T = string>(key: string): T | undefined;
}

export const DEFAULT_POLL_INTERVAL_MS = 1500;
export const DEFAULT_BATCH_SIZE = 500;
export const DEFAULT_ACTIVE_CHECK_INTERVAL_S = 15;
export const DEFAULT_RECONCILE_INTERVAL_MIN = 60;
export const DEFAULT_OVERLAP = 100;

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readPunishmentsConfig(env: EnvReader): PunishmentsConfig {
  return {
    enabled: toBoolean(env.get('LITEBANS_ENABLED')),
    pollIntervalMs: toNumber(
      env.get('LITEBANS_POLL_INTERVAL_MS'),
      DEFAULT_POLL_INTERVAL_MS,
    ),
    batchSize: toNumber(env.get('LITEBANS_BATCH_SIZE'), DEFAULT_BATCH_SIZE),
    activeCheckIntervalMs:
      toNumber(
        env.get('LITEBANS_ACTIVE_CHECK_INTERVAL_S'),
        DEFAULT_ACTIVE_CHECK_INTERVAL_S,
      ) * 1000,
    reconcileIntervalMs:
      toNumber(
        env.get('LITEBANS_RECONCILE_INTERVAL_MIN'),
        DEFAULT_RECONCILE_INTERVAL_MIN,
      ) * 60_000,
    overlap: DEFAULT_OVERLAP,
  };
}
