import { BridgeDeliveryJobStatus, DeliveryTaskStatus } from '@prisma/client';
import {
  BridgeDeliveryService,
  claimTokensEqual,
} from './bridge-delivery.service';
import { BridgeDeliveryRetentionScheduler } from './bridge-delivery-retention.scheduler';
import { readBridgeDeliveryRetention } from './bridge-delivery-retention';
import type { BridgeConfig } from './bridge.config';

const TOKEN = '123e4567-e89b-12d3-a456-426614174000';
const DAY = 86_400_000;

describe('claimTokensEqual (L1, L5)', () => {
  it('равные токены, в т.ч. с иным регистром', () => {
    expect(claimTokensEqual(TOKEN, TOKEN)).toBe(true);
    expect(claimTokensEqual(TOKEN, TOKEN.toUpperCase())).toBe(true);
  });
  it('разная длина и разное содержимое -> false без исключения', () => {
    expect(claimTokensEqual(TOKEN, TOKEN.slice(0, 35))).toBe(false);
    expect(claimTokensEqual(TOKEN, `${TOKEN}0`)).toBe(false);
    expect(claimTokensEqual(TOKEN, TOKEN.replace('1', '2'))).toBe(false);
    expect(claimTokensEqual('', TOKEN)).toBe(false);
  });
});

describe('BridgeDeliveryService.ack: токен в верхнем регистре (L5)', () => {
  it('принимается, CAS идёт по токену из БД', async () => {
    const prisma = {
      bridgeDeliveryJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job_12345678',
          taskId: 't1',
          attempt: 1,
          idempotencyKey: 'i1:1',
          serverSlug: 'survival',
          status: BridgeDeliveryJobStatus.CLAIMED,
          ackCode: null,
          claimedAt: new Date(),
          claimToken: TOKEN,
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const svc = new BridgeDeliveryService(
      prisma as never,
      {
        enabled: true,
        masterSecret: 'x',
        deliveryEnabled: true,
        statsEnabled: false,
      } as unknown as BridgeConfig,
    );
    const res = await svc.ack('survival', {
      jobId: 'job_12345678',
      claimToken: TOKEN.toUpperCase(),
      status: 'done',
      code: null,
    });
    expect(res.status).toBe('accepted');
    expect(
      prisma.bridgeDeliveryJob.updateMany.mock.calls[0][0].where.claimToken,
    ).toBe(TOKEN);
  });
});

describe('readBridgeDeliveryRetention (L2)', () => {
  const env = (o: Record<string, string>) => ({
    get: <T>(k: string) => o[k] as unknown as T,
  });
  it('по умолчанию 30 суток', () => {
    expect(readBridgeDeliveryRetention(env({}))).toEqual({
      retentionDays: 30,
      enabled: true,
    });
  });
  it('меньше 14, нецелое и не число - отказ', () => {
    for (const v of ['13', '0', '14.5', 'abc']) {
      expect(() =>
        readBridgeDeliveryRetention(
          env({ BRIDGE_DELIVERY_JOB_RETENTION_DAYS: v }),
        ),
      ).toThrow();
    }
  });
  it('флаг выключает', () => {
    expect(
      readBridgeDeliveryRetention(
        env({ BRIDGE_DELIVERY_JOB_CLEANUP_ENABLED: 'false' }),
      ).enabled,
    ).toBe(false);
  });
});

describe('BridgeDeliveryRetentionScheduler (L2)', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  function make() {
    const findMany = jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { bridgeDeliveryJob: { findMany, deleteMany } };
    const scheduler = new BridgeDeliveryRetentionScheduler(
      prisma as never,
      { get: () => undefined } as never,
    );
    return { scheduler, findMany, deleteMany };
  }
  it('удаляет только закрытые старше срока, QUEUED/CLAIMED исключены', async () => {
    const { scheduler, findMany, deleteMany } = make();
    const res = await scheduler.runOnce(now);
    expect(res.deleted).toBe(2);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(
      expect.not.arrayContaining([
        BridgeDeliveryJobStatus.QUEUED,
        BridgeDeliveryJobStatus.CLAIMED,
      ]),
    );
    expect(where.updatedAt.lt).toEqual(new Date(now.getTime() - 30 * DAY));
    // UNKNOWN с заданием в NEEDS_ATTENTION не удаляется.
    expect(where.NOT).toEqual({
      status: BridgeDeliveryJobStatus.UNKNOWN,
      task: { status: DeliveryTaskStatus.NEEDS_ATTENTION },
    });
    // Повторная проверка статуса и возраста в самом DELETE.
    const del = deleteMany.mock.calls[0][0].where;
    expect(del.id).toEqual({ in: ['a', 'b'] });
    expect(del.status.in).not.toContain(BridgeDeliveryJobStatus.QUEUED);
    expect(del.status.in).not.toContain(BridgeDeliveryJobStatus.CLAIMED);
  });
});
