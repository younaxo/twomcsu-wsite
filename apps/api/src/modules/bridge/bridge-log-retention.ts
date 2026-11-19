import {
  DEFAULT_LOG_RETENTION_DAYS,
  MIN_LOG_RETENTION_DAYS,
} from './bridge.constants';
import { EnvReader } from './bridge.config';

export interface BridgeLogRetentionConfig {
  retentionDays: number;
  /// `BRIDGE_LOG_CLEANUP_ENABLED=false` выключает таймер (в тестах тоже выкл.).
  enabled: boolean;
}

/// Порог хранения не меньше 7 суток СТРОГО (7.1 контракта, F5): значение
/// меньше, нецелое или нечисловое - ошибка, старт не проходит (fail closed).
export function readBridgeLogRetention(
  env: EnvReader,
): BridgeLogRetentionConfig {
  const raw = env.get<string | number>('BRIDGE_LOG_RETENTION_DAYS');
  let days = DEFAULT_LOG_RETENTION_DAYS;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    days = Number(raw);
  }
  if (!Number.isInteger(days) || days < MIN_LOG_RETENTION_DAYS) {
    throw new Error(
      `BRIDGE_LOG_RETENTION_DAYS должен быть целым не меньше ${MIN_LOG_RETENTION_DAYS}`,
    );
  }
  const flag = String(env.get('BRIDGE_LOG_CLEANUP_ENABLED') ?? 'true');
  return { retentionDays: days, enabled: flag.toLowerCase() !== 'false' };
}
