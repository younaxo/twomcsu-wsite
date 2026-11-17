import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  PrismaInventoryStore,
  TX_MAX_WAIT_MS,
  TX_TIMEOUT_MS,
} from './prisma-inventory.store';

const KEY = { userId: 'u1', serverSlug: 's1', group: 'main' } as never;

describe('PrismaInventoryStore: опции транзакции (ADR-0183)', () => {
  it('передаёт явные быстрые maxWait/timeout и Serializable, не общие 10 с', async () => {
    const $transaction = jest.fn().mockResolvedValue({ ok: true });
    const store = new PrismaInventoryStore({
      $transaction,
    } as unknown as PrismaService);

    await store.mutate(KEY, () => ({ write: null, result: {} as never }));

    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: TX_MAX_WAIT_MS,
      timeout: TX_TIMEOUT_MS,
    });
    expect(TX_MAX_WAIT_MS).toBe(2000);
    expect(TX_TIMEOUT_MS).toBe(5000);
  });

  it('повторяет при P2034 не больше 4 раз, затем пробрасывает ошибку', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    const $transaction = jest.fn().mockRejectedValue(error);
    const store = new PrismaInventoryStore({
      $transaction,
    } as unknown as PrismaService);

    await expect(
      store.mutate(KEY, () => ({ write: null, result: {} as never })),
    ).rejects.toBe(error);
    expect($transaction).toHaveBeenCalledTimes(4);
  });
});
