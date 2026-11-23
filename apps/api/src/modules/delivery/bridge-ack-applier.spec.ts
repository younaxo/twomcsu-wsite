import { BridgeDeliveryJobStatus } from '@prisma/client';
import type { JobSnapshot } from '../bridge/bridge-delivery.service';
import { BridgeAckApplier } from './bridge-ack-applier';
import { BridgeExecutor } from './executors/bridge.executor';

const job = (over: Partial<JobSnapshot> = {}): JobSnapshot => ({
  id: 'job_12345678',
  taskId: 't1',
  attempt: 2,
  idempotencyKey: 'i1:2',
  serverSlug: 'survival',
  status: BridgeDeliveryJobStatus.DONE,
  ackCode: null,
  claimedAt: null,
  ...over,
});

function setup(task: { leaseToken: string | null; attempts: number } | null) {
  const executor = new BridgeExecutor({} as never);
  const delivery = { applyResult: jest.fn().mockResolvedValue(true) };
  const prisma = {
    deliveryTask: { findUnique: jest.fn().mockResolvedValue(task) },
  };
  const bridge = { onSettled: jest.fn() };
  const applier = new BridgeAckApplier(
    bridge as never,
    executor,
    delivery as never,
    prisma as never,
  );
  return { applier, delivery, bridge };
}

describe('BridgeAckApplier (0.13)', () => {
  it('регистрирует слушателя при старте', () => {
    const { applier, bridge } = setup(null);
    applier.onModuleInit();
    expect(bridge.onSettled).toHaveBeenCalledTimes(1);
  });

  it('поздний ack done переносится в задание той же попытки', async () => {
    const { applier, delivery } = setup({ leaseToken: 'L', attempts: 2 });
    expect(await applier.apply(job())).toBe(true);
    expect(delivery.applyResult).toHaveBeenCalledWith('t1', 'L', {
      kind: 'delivered',
      externalRef: 'bridge:survival',
    });
  });

  it('исход чужой (более ранней) попытки не применяется', async () => {
    const { applier, delivery } = setup({ leaseToken: 'L', attempts: 3 });
    expect(await applier.apply(job())).toBe(false);
    expect(delivery.applyResult).not.toHaveBeenCalled();
  });

  it('нет задания или токена аренды, либо нет исхода -> ничего', async () => {
    expect(await setup(null).applier.apply(job())).toBe(false);
    const s = setup({ leaseToken: null, attempts: 2 });
    expect(await s.applier.apply(job())).toBe(false);
    const q = setup({ leaseToken: 'L', attempts: 2 });
    expect(
      await q.applier.apply(job({ status: BridgeDeliveryJobStatus.CLAIMED })),
    ).toBe(false);
    expect(q.delivery.applyResult).not.toHaveBeenCalled();
  });

  it('ошибка применения не пробрасывается', async () => {
    const { applier, delivery } = setup({ leaseToken: 'L', attempts: 2 });
    delivery.applyResult.mockRejectedValue(new Error('boom'));
    expect(await applier.apply(job())).toBe(false);
  });
});
