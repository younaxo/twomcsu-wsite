import { BridgeDeliveryJobStatus } from '@prisma/client';
import type {
  BridgeDeliveryService,
  JobSnapshot,
} from '../../bridge/bridge-delivery.service';
import { DeliveryTaskSnapshot } from '../delivery-executor.interface';
import { BridgeExecutor } from './bridge.executor';

const job = (over: Partial<JobSnapshot> = {}): JobSnapshot => ({
  id: 'job_12345678',
  taskId: 't1',
  attempt: 1,
  idempotencyKey: 'i1:1',
  serverSlug: 'survival',
  status: BridgeDeliveryJobStatus.QUEUED,
  ackCode: null,
  claimedAt: null,
  ...over,
});

const task = (
  over: Partial<DeliveryTaskSnapshot> = {},
): DeliveryTaskSnapshot => ({
  taskId: 't1',
  orderItemId: 'i1',
  orderId: 'o1',
  step: 1,
  executor: 'bridge',
  attempt: 1,
  idempotencyKey: 'i1:1',
  nick: 'Steve',
  recipientUserId: 'u1',
  quantity: 1,
  decorationId: null,
  renderedCommand: 'lp user Steve parent addtemp vip 30d',
  bridge: { serverSlug: 'survival', extraCommandRoots: [] },
  ...over,
});

type Mocks = Record<string, jest.Mock>;

function setup(over: Mocks = {}) {
  const bridge: Mocks = {
    isOperational: jest.fn().mockReturnValue(true),
    serverState: jest.fn().mockResolvedValue('ok'),
    enqueue: jest.fn().mockResolvedValue(job()),
    getById: jest.fn().mockResolvedValue(job()),
    cancelIfQueued: jest.fn().mockResolvedValue(true),
    ...over,
  };
  const executor = new BridgeExecutor(
    bridge as unknown as BridgeDeliveryService,
  );
  executor.timing.ackWaitMs = 30;
  executor.timing.pollMs = 5;
  return { executor, bridge };
}

const claimed = () => job({ status: BridgeDeliveryJobStatus.CLAIMED });

describe('BridgeExecutor (0.13)', () => {
  it('не идемпотентен и автоматический', () => {
    const { executor } = setup();
    expect(executor.idempotent).toBe(false);
    expect(executor.automatic).toBe(true);
  });

  it('flag off / fail closed: не ставит в очередь, retry bridge_disabled', async () => {
    const { executor, bridge } = setup({
      isOperational: jest.fn().mockReturnValue(false),
    });
    expect(executor.operational()).toBe(false);
    expect(await executor.execute(task())).toEqual({
      kind: 'retry',
      reason: 'bridge_disabled',
    });
    expect(bridge.enqueue).not.toHaveBeenCalled();
  });

  it('команда вне белого списка -> failed, очередь не затронута', async () => {
    const { executor, bridge } = setup();
    const res = await executor.execute(task({ renderedCommand: 'op Steve' }));
    expect(res.kind).toBe('failed');
    expect(bridge.enqueue).not.toHaveBeenCalled();
  });

  it('нет команды, плохой ник, нет цели -> failed', async () => {
    const { executor } = setup();
    expect(await executor.execute(task({ renderedCommand: null }))).toEqual({
      kind: 'failed',
      reason: 'no_command',
    });
    expect((await executor.execute(task({ nick: 'a b' }))).kind).toBe('failed');
    expect(await executor.execute(task({ bridge: null }))).toEqual({
      kind: 'failed',
      reason: 'bridge_no_target',
    });
  });

  it.each(['offline', 'inactive', 'no_capability', 'unknown_server'])(
    'сервер %s -> retry до постановки',
    async (state) => {
      const { executor, bridge } = setup({
        serverState: jest.fn().mockResolvedValue(state),
      });
      expect(await executor.execute(task())).toEqual({
        kind: 'retry',
        reason: `bridge_server_${state}`,
      });
      expect(bridge.enqueue).not.toHaveBeenCalled();
    },
  );

  it('идемпотентность: ключ и привязка к серверу передаются в enqueue', async () => {
    const { executor, bridge } = setup({
      enqueue: jest
        .fn()
        .mockResolvedValue(job({ status: BridgeDeliveryJobStatus.DONE })),
    });
    const res = await executor.execute(task());
    expect(res).toEqual({ kind: 'delivered', externalRef: 'bridge:survival' });
    expect(bridge.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'i1:1',
        serverSlug: 'survival',
        taskId: 't1',
        attempt: 1,
        command: 'lp user Steve parent addtemp vip 30d',
      }),
    );
  });

  it('ack done во время ожидания -> delivered', async () => {
    const getById = jest
      .fn()
      .mockResolvedValueOnce(claimed())
      .mockResolvedValue(job({ status: BridgeDeliveryJobStatus.DONE }));
    const { executor } = setup({ getById });
    expect((await executor.execute(task())).kind).toBe('delivered');
  });

  it('отказ плагина -> failed с причиной', async () => {
    const { executor } = setup({
      getById: jest.fn().mockResolvedValue(
        job({
          status: BridgeDeliveryJobStatus.FAILED,
          ackCode: 'no_player',
        }),
      ),
    });
    expect(await executor.execute(task())).toEqual({
      kind: 'failed',
      reason: 'bridge_no_player',
    });
  });

  it('захвачено, но ack не пришёл -> unknown, без авто-retry и без отмены', async () => {
    const { executor, bridge } = setup({
      getById: jest.fn().mockResolvedValue(claimed()),
    });
    expect(await executor.execute(task())).toEqual({
      kind: 'unknown',
      reason: 'bridge_ack_timeout',
    });
    expect(bridge.cancelIfQueued).not.toHaveBeenCalled();
  });

  it('не захвачено к дедлайну -> атомарная отмена и retry', async () => {
    const { executor, bridge } = setup();
    expect(await executor.execute(task())).toEqual({
      kind: 'retry',
      reason: 'bridge_not_claimed',
    });
    expect(bridge.cancelIfQueued).toHaveBeenCalledWith('job_12345678');
  });

  it('гонка: отмена не удалась, задание захвачено -> unknown, не retry', async () => {
    let reads = 0;
    const { executor } = setup({
      cancelIfQueued: jest.fn().mockResolvedValue(false),
      // QUEUED на всех чтениях цикла, CLAIMED только после неудачной отмены.
      getById: jest.fn().mockImplementation(() => {
        reads += 1;
        return Promise.resolve(reads < 50 ? job() : claimed());
      }),
    });
    // Ускоряем: после дедлайна цикл делает чтение, затем отмену, затем чтение.
    const origCancel = (executor as unknown as { bridge: Mocks }).bridge
      .cancelIfQueued;
    origCancel.mockImplementation(() => {
      reads = 100;
      return Promise.resolve(false);
    });
    const res = await executor.execute(task());
    expect(res).toEqual({ kind: 'unknown', reason: 'bridge_ack_timeout' });
  });

  it('уже захваченное параллельным запуском -> unknown', async () => {
    const { executor } = setup({
      enqueue: jest.fn().mockResolvedValue(claimed()),
    });
    expect(await executor.execute(task())).toEqual({
      kind: 'unknown',
      reason: 'bridge_claim_in_flight',
    });
  });

  it('ack unknown от плагина -> unknown', () => {
    const { executor } = setup();
    expect(
      executor.toResult(job({ status: BridgeDeliveryJobStatus.UNKNOWN })),
    ).toMatchObject({ kind: 'unknown' });
  });
});
