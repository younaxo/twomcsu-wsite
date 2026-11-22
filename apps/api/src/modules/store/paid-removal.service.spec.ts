import { Prisma } from '@prisma/client';
import { PaidRemovalService } from './paid-removal.service';

const NOW = new Date('2026-11-23T12:00:00Z');
const RULES = JSON.stringify({
  version: '7',
  enabled: true,
  unbanEnabled: true,
  unmuteEnabled: true,
  allowedReasons: ['spam'],
  maxPerNick: 1,
  periodDays: 30,
  actorUserId: 'sys1',
});

interface Opts {
  env?: boolean | string;
  rules?: string | null;
  productTypes?: Array<{ id: string; type: string }>;
  punishment?: object | null;
  records?: number;
  existingRecord?: object | null;
  item?: object | null;
  actor?: object | null;
  createError?: Error;
}

const GOOD_PUNISHMENT = {
  id: 'p1',
  reason: 'Spam in chat',
  startedAt: new Date('2026-11-01T00:00:00Z'),
  executorUuid: null,
  executorName: 'Mod',
  executorIsConsole: false,
};

function setup(o: Opts = {}) {
  const tx = {
    paidRemovalRecord: {
      create: jest.fn().mockImplementation(async () => {
        if (o.createError) throw o.createError;
        return {};
      }),
    },
  };
  const prisma = {
    siteSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          o.rules === undefined || o.rules === null ? null : { value: o.rules },
        ),
    },
    product: {
      findMany: jest.fn().mockResolvedValue(o.productTypes ?? []),
    },
    minecraftPunishment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          o.punishment === undefined ? GOOD_PUNISHMENT : o.punishment,
        ),
    },
    paidRemovalRecord: {
      count: jest.fn().mockResolvedValue(o.records ?? 0),
      findUnique: jest.fn().mockResolvedValue(o.existingRecord ?? null),
    },
    orderItem: { findUnique: jest.fn().mockResolvedValue(o.item ?? null) },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(o.actor === undefined ? { id: 'sys1' } : o.actor),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const config = {
    get: jest.fn().mockReturnValue(o.env === undefined ? true : o.env),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PaidRemovalService(
    prisma as never,
    config as never,
    audit as never,
  );
  return { service, prisma, tx, audit };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return undefined;
  } catch (e) {
    const r = (e as { getResponse?: () => { code?: string } }).getResponse?.();
    return r?.code ?? (e as Error).message;
  }
}

const line = (productId = 'pr1', quantity = 1) => [{ productId, quantity }];
const unban = [{ id: 'pr1', type: 'UNBAN' }];

describe('PaidRemovalService.assertPurchasable (0.12b)', () => {
  it('обычный товар: правила не читаются, проходит', async () => {
    const { service, prisma } = setup({ productTypes: [] });
    await expect(
      service.assertPurchasable(line(), 'Steve', NOW),
    ).resolves.toBeUndefined();
    expect(prisma.siteSetting.findUnique).not.toHaveBeenCalled();
  });

  it('нет настройки правил: paid_removal_unavailable (fail closed)', async () => {
    const { service } = setup({ productTypes: unban, rules: null });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'paid_removal_unavailable',
    );
  });

  it('пустой список причин: paid_removal_unavailable', async () => {
    const { service } = setup({
      productTypes: unban,
      rules: JSON.stringify({ enabled: true, unbanEnabled: true }),
    });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'paid_removal_unavailable',
    );
  });

  it.each([false, 'false', 'no'])(
    'UNPUNISH_ENABLED=%p в env: paid_removal_unavailable, правила не читаются',
    async (env) => {
      const { service, prisma } = setup({
        productTypes: unban,
        rules: RULES,
        env,
      });
      expect(
        await codeOf(service.assertPurchasable(line(), 'Steve', NOW)),
      ).toBe('paid_removal_unavailable');
      expect(prisma.siteSetting.findUnique).not.toHaveBeenCalled();
    },
  );

  it('количество больше 1: paid_removal_single_only', async () => {
    const { service } = setup({ productTypes: unban, rules: RULES });
    expect(
      await codeOf(service.assertPurchasable(line('pr1', 2), 'Steve', NOW)),
    ).toBe('paid_removal_single_only');
  });

  it('нет подходящего наказания: единый nick_unavailable', async () => {
    const { service } = setup({
      productTypes: unban,
      rules: RULES,
      punishment: null,
    });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'nick_unavailable',
    );
  });

  it('причина вне списка: nick_unavailable', async () => {
    const { service } = setup({
      productTypes: unban,
      rules: RULES,
      punishment: { ...GOOD_PUNISHMENT, reason: 'grief' },
    });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'nick_unavailable',
    );
  });

  it('неизвестный выдавший: nick_unavailable', async () => {
    const { service } = setup({
      productTypes: unban,
      rules: RULES,
      punishment: {
        ...GOOD_PUNISHMENT,
        executorName: null,
        executorUuid: null,
        executorIsConsole: false,
      },
    });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'nick_unavailable',
    );
  });

  it('лимит платных снятий на ник исчерпан: тот же nick_unavailable', async () => {
    const { service } = setup({
      productTypes: unban,
      rules: RULES,
      records: 1,
    });
    expect(await codeOf(service.assertPurchasable(line(), 'Steve', NOW))).toBe(
      'nick_unavailable',
    );
  });

  it('всё сходится: проходит', async () => {
    const { service } = setup({ productTypes: unban, rules: RULES });
    await expect(
      service.assertPurchasable(line(), 'Steve', NOW),
    ).resolves.toBeUndefined();
  });
});

describe('PaidRemovalService.recordRemoval (0.12b)', () => {
  const item = {
    id: 'i1',
    quantity: 1,
    order: {
      id: 'o1',
      orderNumber: 'O-20261123-ABCDEF',
      status: 'COMPLETED',
      guestMinecraftNick: 'Steve',
    },
    product: { type: 'UNMUTE' },
  };

  it('пишет журнал и аудит с номером заказа в одной транзакции (strict)', async () => {
    const { service, tx, audit } = setup({ item, rules: RULES });
    const res = await service.recordRemoval('i1', NOW);
    expect(res).toMatchObject({
      created: true,
      orderNumber: 'O-20261123-ABCDEF',
    });
    expect(tx.paidRemovalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderItemId: 'i1',
        orderNumber: 'O-20261123-ABCDEF',
        ruleVersion: '7',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'sys1',
        action: 'punishment.paid_removal',
        strict: true,
        tx,
        changes: expect.objectContaining({
          orderNumber: 'O-20261123-ABCDEF',
          summary: expect.stringContaining('заказ № O-20261123-ABCDEF'),
        }),
      }),
    );
  });

  it('повтор (запись уже есть): created=false, аудит и транзакция не повторяются', async () => {
    const { service, audit, prisma } = setup({
      item,
      rules: RULES,
      existingRecord: { punishmentId: 'p1' },
    });
    const res = await service.recordRemoval('i1', NOW);
    expect(res.created).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('гонка (P2002 на orderItemId): created=false, без исключения', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service } = setup({ item, rules: RULES, createError: err });
    await expect(service.recordRemoval('i1', NOW)).resolves.toMatchObject({
      created: false,
    });
  });

  it('аудит не записался (strict): ошибка пробрасывается', async () => {
    const { service, audit } = setup({ item, rules: RULES });
    audit.log.mockRejectedValueOnce(new Error('audit down'));
    await expect(service.recordRemoval('i1', NOW)).rejects.toThrow(
      'audit down',
    );
  });

  it('заказ не COMPLETED, количество 2, нет ника: not_applicable', async () => {
    for (const patch of [
      { order: { ...item.order, status: 'PENDING' } },
      { quantity: 2 },
      { order: { ...item.order, guestMinecraftNick: null } },
    ]) {
      const { service } = setup({ item: { ...item, ...patch }, rules: RULES });
      expect(await codeOf(service.recordRemoval('i1', NOW))).toBe(
        'paid_removal_not_applicable',
      );
    }
  });

  it('нет системного актора: paid_removal_actor_missing, записи нет', async () => {
    const { service, tx } = setup({ item, rules: RULES, actor: null });
    expect(await codeOf(service.recordRemoval('i1', NOW))).toBe(
      'paid_removal_actor_missing',
    );
    expect(tx.paidRemovalRecord.create).not.toHaveBeenCalled();
  });

  it('наказания уже нет: not_applicable, записи нет', async () => {
    const { service, tx } = setup({ item, rules: RULES, punishment: null });
    expect(await codeOf(service.recordRemoval('i1', NOW))).toBe(
      'paid_removal_not_applicable',
    );
    expect(tx.paidRemovalRecord.create).not.toHaveBeenCalled();
  });

  it('правила пусты: paid_removal_unavailable', async () => {
    const { service } = setup({ item, rules: null });
    expect(await codeOf(service.recordRemoval('i1', NOW))).toBe(
      'paid_removal_unavailable',
    );
  });
});
