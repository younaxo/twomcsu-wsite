import { ConfigService } from '@nestjs/config';

export const WALLET_ENV = {
  enabled: 'WALLET_LEDGER_ENABLED',
  adjustMax: 'WALLET_ADJUST_MAX',
  adjustDailyMax: 'WALLET_ADJUST_DAILY_MAX',
} as const;

/// Флаг выключен по умолчанию (fail closed): включает только явное true.
export function walletLedgerEnabled(config: ConfigService): boolean {
  const raw = config.get<boolean | string | undefined>(WALLET_ENV.enabled);
  return raw === true || raw === 'true';
}

export const WALLET_ADJUST_MAX_DEFAULT = 100_000;

/// Потолок одной ручной корректировки (по модулю), рубины.
export function walletAdjustMax(config: ConfigService): number {
  const n = Number(
    config.get<number | string | undefined>(WALLET_ENV.adjustMax),
  );
  if (!Number.isInteger(n) || n < 1) return WALLET_ADJUST_MAX_DEFAULT;
  return Math.min(n, 10_000_000);
}

export const WALLET_ADJUST_DAILY_MAX_DEFAULT = 500_000;

/// Суточный лимит суммы корректировок одного актёра (сумма модулей за
/// скользящие 24 часа), рубины.
export function walletAdjustDailyMax(config: ConfigService): number {
  const n = Number(
    config.get<number | string | undefined>(WALLET_ENV.adjustDailyMax),
  );
  if (!Number.isInteger(n) || n < 1) return WALLET_ADJUST_DAILY_MAX_DEFAULT;
  return Math.min(n, 1_000_000_000);
}
