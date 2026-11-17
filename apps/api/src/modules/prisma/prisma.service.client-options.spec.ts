const ctorSpy = jest.fn();

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual<typeof import('@prisma/client')>(
    '@prisma/client',
  );
  class FakePrismaClient {
    constructor(options: unknown) {
      ctorSpy(options);
    }
  }
  return { ...actual, PrismaClient: FakePrismaClient };
});

import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService: PrismaClient получает transactionOptions (ADR-0183)', () => {
  beforeEach(() => ctorSpy.mockClear());

  it('передаёт maxWait и timeout из конфигурации в конструктор клиента', () => {
    new PrismaService(
      new ConfigService({
        PRISMA_TX_MAX_WAIT_MS: 7000,
        PRISMA_TX_TIMEOUT_MS: 12_000,
      }),
    );
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    expect(ctorSpy.mock.calls[0][0]).toMatchObject({
      transactionOptions: { maxWait: 7000, timeout: 12_000 },
    });
  });
});
