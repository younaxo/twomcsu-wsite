import {
  DELIVERY_JOB_RETENTION_DEFAULT_DAYS,
  DELIVERY_JOB_RETENTION_MIN_DAYS,
} from './bridge.constants';
import { EnvReader } from './bridge.config';

export interface BridgeDeliveryRetentionConfig {
  retentionDays: number;
  /// `BRIDGE_DELIVERY_JOB_CLEANUP_ENABLED=false` выключает таймер.
  enabled: boolean;
}

/// Срок хранения закрытых заданий выдачи: целое не меньше 14 суток (нужно
/// для разбора спорных выдач). Иное значение - ошибка старта (fail closed).
export function readBridgeDeliveryRetention(
  env: EnvReader,
): BridgeDeliveryRetentionConfig {
  const raw = env.get<string | number>('BRIDGE_DELIVERY_JOB_RETENTION_DAYS');
  let days = DELIVERY_JOB_RETENTION_DEFAULT_DAYS;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    days = Number(raw);
  }
  if (!Number.isInteger(days) || days < DELIVERY_JOB_RETENTION_MIN_DAYS) {
    throw new Error(
      `BRIDGE_DELIVERY_JOB_RETENTION_DAYS должен быть целым не меньше ${DELIVERY_JOB_RETENTION_MIN_DAYS}`,
    );
  }
  const flag = String(env.get('BRIDGE_DELIVERY_JOB_CLEANUP_ENABLED') ?? 'true');
  return { retentionDays: days, enabled: flag.toLowerCase() !== 'false' };
}
