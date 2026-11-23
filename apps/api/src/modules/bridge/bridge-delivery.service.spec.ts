import { BridgeDeliveryJobStatus, Prisma } from '@prisma/client';
import { BridgeDeliveryService } from './bridge-delivery.service';
import type { BridgeConfig } from './bridge.config';

const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig =>
  ({
    enabled: true,
    masterSecret: 'test-master-secret-placeholder-0000',
    deliveryEnabled: true,
    ...over,
  }) as unknown as BridgeConfig;

const TOKEN = '123e4567-e89b-12d3-a456-426614174000';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'job_12345678',
  taskId: 't1',
  attempt: 1,
  idempotencyKey: 'i1:1',
  serverSlug: 'survival',
  status: BridgeDeliveryJobStatus.CLAIMED,
  ackCode: null,
  claimedAt: new Date(),
  claimToken: TOKEN,
  ...over,
});
const ackIn = (over: Record<string, unknown> = {}) => ({
  jobId: 'job_12345678',
  claimToken: TOKEN,
  status: 'done' as const,
  code: null,
  ...over,
});

function setup(config = cfg()) {
  const prisma = {
    bridgeDeliveryJob: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    bridgeServer: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
    siteSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const svc = new BridgeDeliveryService(prisma as never, config);
  return { svc, prisma };
}

describe('BridgeDeliveryService (0.13)', () => {
  it('isOperational: нужны приёмник, секрет и флаг выдачи (fail closed)', () => {
    expect(setup().svc.isOperational()).toBe(true);
    expect(setup(cfg({ deliveryEnabled: false })).svc.isOperational()).toBe(
      false,
    );
    expect(setup(cfg({ masterSecret: null })).svc.isOperational()).toBe(false);
    expect(setup(cfg({ enabled: false })).svc.isOperational()).toBe(false);
  });

  describe('ack', () => {
    it('ищет только среди заданий своего сервера (чужой -> unknown_job)', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(null);
      const res = await svc.ack('other', ackIn());
      expect(res).toEqual({
        jobId: 'job_12345678',
        status: 'rejected',
        code: 'unknown_job',
      });
      expect(prisma.bridgeDeliveryJob.findFirst.mock.calls[0][0].where).toEqual(
        { id: 'job_12345678', serverSlug: 'other' },
      );
      expect(prisma.bridgeDeliveryJob.updateMany).not.toHaveBeenCalled();
    });

    it('неверный токен -> token_mismatch, без изменений', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(row());
      const res = await svc.ack(
        'survival',
        ackIn({ claimToken: '00000000-0000-0000-0000-000000000000' }),
      );
      expect(res).toMatchObject({ status: 'rejected', code: 'token_mismatch' });
      expect(prisma.bridgeDeliveryJob.updateMany).not.toHaveBeenCalled();
    });

    it('не захваченное задание -> not_claimed', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(
        row({ claimToken: null, status: BridgeDeliveryJobStatus.QUEUED }),
      );
      expect(await svc.ack('survival', ackIn())).toMatchObject({
        code: 'not_claimed',
      });
    });

    it('done -> accepted, CAS по токену и CLAIMED, слушатель уведомлён', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(row());
      prisma.bridgeDeliveryJob.findUnique.mockResolvedValue(
        row({ status: BridgeDeliveryJobStatus.DONE }),
      );
      const listener = jest.fn();
      svc.onSettled(listener);
      const res = await svc.ack('survival', ackIn());
      expect(res.status).toBe('accepted');
      const arg = prisma.bridgeDeliveryJob.updateMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({
        claimToken: TOKEN,
        status: BridgeDeliveryJobStatus.CLAIMED,
      });
      expect(arg.data.status).toBe(BridgeDeliveryJobStatus.DONE);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('падение слушателя не ломает ack', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(row());
      prisma.bridgeDeliveryJob.findUnique.mockResolvedValue(row());
      svc.onSettled(() => {
        throw new Error('x');
      });
      const res = await svc.ack(
        'survival',
        ackIn({ status: 'failed', code: 'no_player' }),
      );
      expect(res.status).toBe('accepted');
    });

    it('повтор того же исхода -> duplicate; иного -> conflict', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(
        row({ status: BridgeDeliveryJobStatus.DONE }),
      );
      expect(await svc.ack('survival', ackIn())).toEqual({
        jobId: 'job_12345678',
        status: 'duplicate',
      });
      expect(
        await svc.ack('survival', ackIn({ status: 'failed' })),
      ).toMatchObject({ status: 'rejected', code: 'conflict' });
      expect(prisma.bridgeDeliveryJob.updateMany).not.toHaveBeenCalled();
    });

    it('поздний done по уже UNKNOWN заданию -> conflict (без авто-перехода)', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.findFirst.mockResolvedValue(
        row({ status: BridgeDeliveryJobStatus.UNKNOWN }),
      );
      expect(await svc.ack('survival', ackIn())).toMatchObject({
        code: 'conflict',
      });
    });
  });

  describe('enqueue', () => {
    const input = {
      idempotencyKey: 'i1:1',
      taskId: 't1',
      attempt: 1,
      serverSlug: 'survival',
      command: 'give Steve stone 1',
      ttlMs: 1000,
    };
    const dup = () =>
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      });

    it('создаёт строку с ключом идемпотентности', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.create.mockResolvedValue(
        row({ status: BridgeDeliveryJobStatus.QUEUED }),
      );
      await svc.enqueue(input);
      expect(
        prisma.bridgeDeliveryJob.create.mock.calls[0][0].data,
      ).toMatchObject({ idempotencyKey: 'i1:1', serverSlug: 'survival' });
    });

    it('повтор по ключу при DONE ничего не меняет', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.create.mockRejectedValue(dup());
      prisma.bridgeDeliveryJob.findUnique.mockResolvedValue(
        row({ status: BridgeDeliveryJobStatus.DONE }),
      );
      const res = await svc.enqueue(input);
      expect(res.status).toBe(BridgeDeliveryJobStatus.DONE);
      expect(prisma.bridgeDeliveryJob.updateMany).not.toHaveBeenCalled();
    });

    it('свежий CLAIMED не перезапускается', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.create.mockRejectedValue(dup());
      prisma.bridgeDeliveryJob.findUnique.mockResolvedValue(row());
      await svc.enqueue(input);
      expect(prisma.bridgeDeliveryJob.updateMany).not.toHaveBeenCalled();
    });

    it('чужая ошибка БД пробрасывается', async () => {
      const { svc, prisma } = setup();
      prisma.bridgeDeliveryJob.create.mockRejectedValue(new Error('db'));
      await expect(svc.enqueue(input)).rejects.toThrow('db');
    });
  });

  describe('claim', () => {
    it('возвращает задания и отмечает сервер «на связи»', async () => {
      const { svc, prisma } = setup();
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'job_12345678',
          idempotencyKey: 'i1:1',
          command: 'give Steve stone 1',
          claimToken: TOKEN,
        },
      ]);
      const res = await svc.claim('survival', 5);
      expect(res).toEqual([
        {
          jobId: 'job_12345678',
          idempotencyKey: 'i1:1',
          command: 'give Steve stone 1',
          claimToken: TOKEN,
        },
      ]);
      expect(prisma.bridgeServer.updateMany).toHaveBeenCalled();
    });

    it('подменённая в БД команда не уходит плагину и закрывается failed', async () => {
      const { svc, prisma } = setup();
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'job_12345678',
          idempotencyKey: 'i1:1',
          command: 'op Steve',
          claimToken: TOKEN,
        },
      ]);
      prisma.bridgeDeliveryJob.findUnique.mockResolvedValue(row());
      expect(await svc.claim('survival', 5)).toEqual([]);
      expect(
        prisma.bridgeDeliveryJob.updateMany.mock.calls[0][0].data,
      ).toMatchObject({
        status: BridgeDeliveryJobStatus.FAILED,
        ackCode: 'command_invalid',
      });
    });
  });

  describe('serverState', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    const old = new Date(now.getTime() - 500_000);
    it.each([
      ['нет сервера', null, 'unknown_server'],
      [
        'отключён',
        {
          status: 'DISABLED',
          capabilities: { delivery: true },
          lastSeenAt: now,
        },
        'inactive',
      ],
      [
        'нет права',
        {
          status: 'ACTIVE',
          capabilities: { delivery: false },
          lastSeenAt: now,
        },
        'no_capability',
      ],
      [
        'давно не виден',
        { status: 'ACTIVE', capabilities: { delivery: true }, lastSeenAt: old },
        'offline',
      ],
      [
        'в порядке',
        { status: 'ACTIVE', capabilities: { delivery: true }, lastSeenAt: now },
        'ok',
      ],
    ])('%s -> %s', async (_n, server, expected) => {
      const { svc, prisma } = setup();
      prisma.bridgeServer.findUnique.mockResolvedValue(server);
      expect(await svc.serverState('survival', 120_000, now)).toBe(expected);
    });
  });
});
