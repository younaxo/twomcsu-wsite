import { ConfigService } from '@nestjs/config';

export const REFUNDS_ENV = {
  enabled: 'STORE_REFUNDS_ENABLED',
  minAgeMinutes: 'STORE_REFUNDS_RECONCILE_MIN_AGE_MINUTES',
  windowHours: 'STORE_REFUNDS_RECONCILE_WINDOW_HOURS',
  batch: 'STORE_REFUNDS_RECONCILE_BATCH',
} as const;

/// Интервал таймера сверки (процесс, не настройка): 5 минут.
export const STORE_RECONCILE_INTERVAL_MS = 5 * 60_000;

/// Флаг выключен по умолчанию (fail closed): включает только явное true.
export function refundsEnabled(config: ConfigService): boolean {
  const raw = config.get<boolean | string | undefined>(REFUNDS_ENV.enabled);
  return raw === true || raw === 'true';
}

export function numberSetting(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(config.get<number | string | undefined>(key));
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export interface ReconcileSettings {
  minAgeMinutes: number;
  windowHours: number;
  batch: number;
}

export function reconcileSettings(config: ConfigService): ReconcileSettings {
  return {
    minAgeMinutes: numberSetting(
      config,
      REFUNDS_ENV.minAgeMinutes,
      15,
      1,
      1440,
    ),
    windowHours: numberSetting(config, REFUNDS_ENV.windowHours, 72, 1, 720),
    batch: numberSetting(config, REFUNDS_ENV.batch, 50, 1, 500),
  };
}
