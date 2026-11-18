import { readPrismaTransactionDefaults } from './prisma-tx-options';

describe('readPrismaTransactionDefaults', () => {
  const from = (env: Record<string, unknown>) =>
    readPrismaTransactionDefaults((key) => env[key]);

  it('без значений - умолчания 10000/10000', () => {
    expect(from({})).toEqual({ maxWait: 10_000, timeout: 10_000 });
  });

  it('берёт значения из конфигурации (числа и строки)', () => {
    expect(
      from({ PRISMA_TX_MAX_WAIT_MS: '4000', PRISMA_TX_TIMEOUT_MS: 15_000 }),
    ).toEqual({ maxWait: 4000, timeout: 15_000 });
  });

  it('значения вне границ или не числа заменяются умолчанием', () => {
    expect(
      from({ PRISMA_TX_MAX_WAIT_MS: 10, PRISMA_TX_TIMEOUT_MS: 999_999 }),
    ).toEqual({ maxWait: 10_000, timeout: 10_000 });
    expect(
      from({ PRISMA_TX_MAX_WAIT_MS: 'abc', PRISMA_TX_TIMEOUT_MS: 2.5 }),
    ).toEqual({ maxWait: 10_000, timeout: 10_000 });
  });
});
