import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService: опции транзакций по умолчанию (ADR-0183)', () => {
  it('берёт maxWait и timeout из ConfigService', () => {
    const config = new ConfigService({
      PRISMA_TX_MAX_WAIT_MS: 7000,
      PRISMA_TX_TIMEOUT_MS: 12_000,
    });
    const service = new PrismaService(config);
    expect(service.transactionDefaults).toEqual({
      maxWait: 7000,
      timeout: 12_000,
    });
  });

  it('без ConfigService читает process.env, затем умолчания', () => {
    const prevWait = process.env.PRISMA_TX_MAX_WAIT_MS;
    const prevTimeout = process.env.PRISMA_TX_TIMEOUT_MS;
    try {
      delete process.env.PRISMA_TX_MAX_WAIT_MS;
      delete process.env.PRISMA_TX_TIMEOUT_MS;
      expect(new PrismaService().transactionDefaults).toEqual({
        maxWait: 10_000,
        timeout: 10_000,
      });
      process.env.PRISMA_TX_MAX_WAIT_MS = '3000';
      expect(new PrismaService().transactionDefaults.maxWait).toBe(3000);
    } finally {
      if (prevWait === undefined) delete process.env.PRISMA_TX_MAX_WAIT_MS;
      else process.env.PRISMA_TX_MAX_WAIT_MS = prevWait;
      if (prevTimeout === undefined) delete process.env.PRISMA_TX_TIMEOUT_MS;
      else process.env.PRISMA_TX_TIMEOUT_MS = prevTimeout;
    }
  });
});
