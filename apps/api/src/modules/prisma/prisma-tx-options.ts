/// Общие опции интерактивных транзакций Prisma (ADR-0183).
/// Значения читаются из конфигурации (Joi: PRISMA_TX_MAX_WAIT_MS,
/// PRISMA_TX_TIMEOUT_MS); эта функция повторяет границы схемы, чтобы
/// PrismaService не зависел от того, прошла ли валидация (юнит-тесты, CLI).

export const PRISMA_TX_MAX_WAIT_DEFAULT_MS = 10_000;
export const PRISMA_TX_MAX_WAIT_MIN_MS = 1_000;
export const PRISMA_TX_MAX_WAIT_MAX_MS = 30_000;
export const PRISMA_TX_TIMEOUT_DEFAULT_MS = 10_000;
export const PRISMA_TX_TIMEOUT_MIN_MS = 1_000;
export const PRISMA_TX_TIMEOUT_MAX_MS = 60_000;

export interface PrismaTransactionDefaults {
  maxWait: number;
  timeout: number;
}

function readBounded(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

/// Некорректное значение (вне границ, не число) заменяется умолчанием, а не
/// роняет запуск: старт с проверкой уже сделала Joi-схема.
export function readPrismaTransactionDefaults(
  get: (key: string) => unknown,
): PrismaTransactionDefaults {
  return {
    maxWait: readBounded(
      get('PRISMA_TX_MAX_WAIT_MS'),
      PRISMA_TX_MAX_WAIT_DEFAULT_MS,
      PRISMA_TX_MAX_WAIT_MIN_MS,
      PRISMA_TX_MAX_WAIT_MAX_MS,
    ),
    timeout: readBounded(
      get('PRISMA_TX_TIMEOUT_MS'),
      PRISMA_TX_TIMEOUT_DEFAULT_MS,
      PRISMA_TX_TIMEOUT_MIN_MS,
      PRISMA_TX_TIMEOUT_MAX_MS,
    ),
  };
}
