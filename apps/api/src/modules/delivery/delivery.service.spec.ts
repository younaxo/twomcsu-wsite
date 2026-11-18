import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryTaskStatus } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import { CommandExecutor } from './executors/command.executor';
import { ManualExecutor } from './executors/manual.executor';
import { MockCommandTransport } from './executors/mock-command-transport';
import { SiteExecutor } from './executors/site.executor';

const S = DeliveryTaskStatus;

interface Opts {
  settings?: Array<{ key: string; value: string }>;
  env?: unknown;
  transport?: MockCommandTransport;
}

function setup(opts: Opts = {}) {
  const tx = {
    order: { findUnique: jest.fn() },
    minecraftAccount: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryTask: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    userDecoration: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 't1' }]),
  };
  const prisma = {
    siteSetting: {
      findMany: jest.fn().mockResolvedValue(opts.settings ?? []),
    },
    orderItem: { findUnique: jest.fn() },
    deliveryTask: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'STORE_DELIVERY_ENABLED' ? opts.env : undefined,
    ),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const transport = opts.transport ?? new MockCommandTransport();
  const service = new DeliveryService(
    prisma as never,
    config as never,
    audit as never,
    new ManualExecutor(),
    new SiteExecutor(prisma as never),
    new CommandExecutor(transport),
  );
  return { service, prisma, tx, config, audit, transport };
}

function orderOf(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    userId: 'buyer',
    guestMinecraftNick: 'Steve',
    items: [
      {
        id: 'i1',
        giftToUserId: null,
        product: { decorationId: null },
      },
    ],
    ...over,
  };
}

describe('DeliveryService.createTasksForOrder (0.7)', () => {
  it('игровой товар без украшения: manual, AWAITING_MANUAL, ник заказа', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(orderOf());
    await service.createTasksForOrder(tx as never, 'o1');
    expect(tx.deliveryTask.createMany).toHaveBeenCalledWith({
      data: [
        {
          orderItemId: 'i1',
          step: 1,
          executor: 'manual',
          status: S.AWAITING_MANUAL,
          nick: 'Steve',
          recipientUserId: 'buyer',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('сайтовое украшение (decorationId): site, PENDING', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(
      orderOf({
        items: [
          { id: 'i1', giftToUserId: null, product: { decorationId: 'd1' } },
        ],
      }),
    );
    await service.createTasksForOrder(tx as never, 'o1');
    const data = tx.deliveryTask.createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({ executor: 'site', status: S.PENDING });
  });

  it('набор (нет товара) идёт на manual', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(
      orderOf({ items: [{ id: 'i1', giftToUserId: null, product: null }] }),
    );
    await service.createTasksForOrder(tx as never, 'o1');
    expect(tx.deliveryTask.createMany.mock.calls[0][0].data[0]).toMatchObject({
      executor: 'manual',
    });
  });

  it('подарок выдаётся получателю: recipientUserId и ник получателя, не покупателя', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(
      orderOf({
        items: [
          {
            id: 'i1',
            giftToUserId: 'friend',
            product: { decorationId: 'd1' },
          },
        ],
      }),
    );
    tx.minecraftAccount.findMany.mockResolvedValue([
      { userId: 'friend', name: 'Alex' },
    ]);
    await service.createTasksForOrder(tx as never, 'o1');
    expect(tx.deliveryTask.createMany.mock.calls[0][0].data[0]).toMatchObject({
      recipientUserId: 'friend',
      nick: 'Alex',
    });
  });

  it('подарок без привязанного ника: ник null, ник покупателя не подставляется', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(
      orderOf({
        items: [{ id: 'i1', giftToUserId: 'friend', product: null }],
      }),
    );
    await service.createTasksForOrder(tx as never, 'o1');
    expect(tx.deliveryTask.createMany.mock.calls[0][0].data[0]).toMatchObject({
      recipientUserId: 'friend',
      nick: null,
    });
  });

  it.each(['all', 'ALL', '*', '@a', 'ab', 'a b', 'Steve;op', 'x'.repeat(17)])(
    'Р9: негодный ник %p не сохраняется',
    async (nick) => {
      const { service, tx } = setup();
      tx.order.findUnique.mockResolvedValue(
        orderOf({ guestMinecraftNick: nick }),
      );
      await service.createTasksForOrder(tx as never, 'o1');
      expect(
        tx.deliveryTask.createMany.mock.calls[0][0].data[0].nick,
      ).toBeNull();
    },
  );

  it('идемпотентность: createMany с skipDuplicates, шаг 1 (UNIQUE orderItemId+step)', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(orderOf());
    tx.deliveryTask.createMany.mockResolvedValueOnce({ count: 1 });
    tx.deliveryTask.createMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.createTasksForOrder(tx as never, 'o1')).resolves.toBe(
      1,
    );
    await expect(service.createTasksForOrder(tx as never, 'o1')).resolves.toBe(
      0,
    );
    for (const call of tx.deliveryTask.createMany.mock.calls) {
      expect(call[0].skipDuplicates).toBe(true);
      expect(call[0].data[0].step).toBe(1);
    }
  });

  it('Р1: поля товара выбираются поимённо, gameCommands не читается', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(orderOf());
    await service.createTasksForOrder(tx as never, 'o1');
    const select = tx.order.findUnique.mock.calls[0][0].select;
    expect(JSON.stringify(select)).not.toContain('gameCommands');
    expect(select.items.select.product).toEqual({
      select: { decorationId: true },
    });
  });

  it('заказ без позиций или не найден: 0 заданий', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue(orderOf({ items: [] }));
    await expect(service.createTasksForOrder(tx as never, 'o1')).resolves.toBe(
      0,
    );
    tx.order.findUnique.mockResolvedValue(null);
    await expect(service.createTasksForOrder(tx as never, 'o1')).resolves.toBe(
      0,
    );
    expect(tx.deliveryTask.createMany).not.toHaveBeenCalled();
  });
});

describe('DeliveryService флаг (ADR-0184 Р10, Q80)', () => {
  it('по умолчанию выключено (настройки нет)', async () => {
    const { service } = setup();
    await expect(service.isEnabled()).resolves.toBe(false);
  });

  it('настройка true, env не задан: включено', async () => {
    const { service } = setup({
      settings: [{ key: 'store.delivery.enabled', value: 'true' }],
    });
    await expect(service.isEnabled()).resolves.toBe(true);
  });

  it.each([false, 'false'])(
    'env STORE_DELIVERY_ENABLED=%p — жёсткий запрет при настройке true',
    async (env) => {
      const { service, prisma } = setup({
        env,
        settings: [{ key: 'store.delivery.enabled', value: 'true' }],
      });
      await expect(service.isEnabled()).resolves.toBe(false);
      expect(prisma.siteSetting.findMany).not.toHaveBeenCalled();
    },
  );

  it('env true без настройки не включает доставку (разрешают оба)', async () => {
    const { service } = setup({ env: true });
    await expect(service.isEnabled()).resolves.toBe(false);
  });

  it('кэш настройки 30 секунд, сброс и истечение перечитывают', async () => {
    const { service, prisma } = setup();
    await service.isEnabled(1_000);
    await service.isEnabled(20_000);
    expect(prisma.siteSetting.findMany).toHaveBeenCalledTimes(1);
    await service.isEnabled(31_001);
    expect(prisma.siteSetting.findMany).toHaveBeenCalledTimes(2);
    service.resetSettingsCache();
    await service.isEnabled(31_002);
    expect(prisma.siteSetting.findMany).toHaveBeenCalledTimes(3);
  });

  it('выключено: processBatch ничего не захватывает', async () => {
    const { service, prisma } = setup();
    await expect(service.processBatch()).resolves.toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('потолок попыток: по умолчанию 5, из настройки 1-20', async () => {
    const a = setup();
    await expect(a.service.settings()).resolves.toMatchObject({
      maxAttempts: 5,
    });
    const b = setup({
      settings: [{ key: 'store.delivery.maxAttempts', value: '3' }],
    });
    await expect(b.service.settings()).resolves.toMatchObject({
      maxAttempts: 3,
    });
    const c = setup({
      settings: [{ key: 'store.delivery.maxAttempts', value: '999' }],
    });
    await expect(c.service.settings()).resolves.toMatchObject({
      maxAttempts: 5,
    });
  });
});

describe('DeliveryService.claimNext (ADR-0184 Р6)', () => {
  it('command по умолчанию выключен: в выборку попадает только site', async () => {
    const { service, prisma } = setup();
    await service.claimNext();
    const sql = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContain('site');
    expect(sql.values).not.toContain('command');
    expect(sql.values).not.toContain('manual');
  });

  it('command включается настройкой', async () => {
    const { service, prisma } = setup({
      settings: [
        { key: 'store.delivery.executor.command.enabled', value: 'true' },
      ],
    });
    await service.claimNext();
    const sql = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(['site', 'command']));
  });

  it('захват использует SKIP LOCKED, токен аренды и проверку шага N-1', async () => {
    const { service, prisma } = setup();
    await service.claimNext();
    const sql = (
      prisma.$queryRaw.mock.calls[0][0] as { strings: string[] }
    ).strings.join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"leaseToken"');
    expect(sql).toContain('attempts = t.attempts + 1');
    expect(sql).toContain('p.step < c.step');
  });

  it('аренда строго длиннее тайм-аута исполнителя', () => {
    const { service } = setup();
    expect(service.leaseMs()).toBeGreaterThan(service.timing.executorTimeoutMs);
  });
});

describe('DeliveryService.applyResult (токен аренды, поздний результат)', () => {
  function withTask(
    status: DeliveryTaskStatus,
    over: Record<string, unknown> = {},
  ) {
    const ctx = setup();
    ctx.tx.deliveryTask.findUnique.mockResolvedValue({
      status,
      leaseToken: 'tok',
      attempts: 1,
      orderItemId: 'i1',
      ...over,
    });
    ctx.tx.deliveryTask.findMany.mockResolvedValue([{ status: S.DELIVERED }]);
    return ctx;
  }

  const lastUpdate = (tx: ReturnType<typeof setup>['tx']) =>
    tx.deliveryTask.updateMany.mock.calls[0][0];

  it('чужой токен: результат отклонён, записи нет', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS);
    await expect(
      service.applyResult('t1', 'other', { kind: 'delivered' }),
    ).resolves.toBe(false);
    expect(tx.deliveryTask.updateMany).not.toHaveBeenCalled();
  });

  it('delivered: DELIVERED, условный переход по токену и статусу, isDelivered пересчитан', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS);
    await expect(
      service.applyResult('t1', 'tok', { kind: 'delivered' }),
    ).resolves.toBe(true);
    expect(lastUpdate(tx)).toMatchObject({
      where: { id: 't1', leaseToken: 'tok', status: S.IN_PROGRESS },
      data: { status: S.DELIVERED, leaseUntil: null },
    });
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1', isDelivered: false },
      }),
    );
  });

  it('retry до потолка: RETRY_WAIT с nextAttemptAt (1 минута для первой попытки)', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS, { attempts: 1 });
    const now = new Date('2026-11-18T10:00:00Z');
    await service.applyResult('t1', 'tok', { kind: 'retry', reason: 'x' }, now);
    const data = lastUpdate(tx).data;
    expect(data.status).toBe(S.RETRY_WAIT);
    expect(data.nextAttemptAt).toEqual(new Date(now.getTime() + 60_000));
  });

  it('retry на потолке попыток: FAILED', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS, { attempts: 5 });
    await service.applyResult('t1', 'tok', { kind: 'retry', reason: 'x' });
    expect(lastUpdate(tx).data.status).toBe(S.FAILED);
  });

  it('unknown: NEEDS_ATTENTION без автоповтора (без nextAttemptAt)', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS);
    await service.applyResult('t1', 'tok', {
      kind: 'unknown',
      reason: 'timeout',
    });
    const data = lastUpdate(tx).data;
    expect(data.status).toBe(S.NEEDS_ATTENTION);
    expect(data.nextAttemptAt).toBeUndefined();
  });

  it('failed: FAILED, ошибка очищена от секретов', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS);
    await service.applyResult('t1', 'tok', {
      kind: 'failed',
      reason: 'auth token=abcdef123456 rejected',
    });
    const data = lastUpdate(tx).data;
    expect(data.status).toBe(S.FAILED);
    expect(data.lastError).not.toContain('abcdef123456');
  });

  it('поздний delivered при NEEDS_ATTENTION и том же токене принимается', async () => {
    const { service, tx } = withTask(S.NEEDS_ATTENTION);
    await expect(
      service.applyResult('t1', 'tok', { kind: 'delivered' }),
    ).resolves.toBe(true);
    expect(lastUpdate(tx)).toMatchObject({
      where: { id: 't1', leaseToken: 'tok', status: S.NEEDS_ATTENTION },
      data: { status: S.DELIVERED },
    });
  });

  it('поздний failed при NEEDS_ATTENTION принимается (FAILED)', async () => {
    const { service, tx } = withTask(S.NEEDS_ATTENTION);
    await service.applyResult('t1', 'tok', { kind: 'failed', reason: 'nope' });
    expect(lastUpdate(tx).data.status).toBe(S.FAILED);
  });

  it.each(['retry', 'unknown', 'awaiting_manual'] as const)(
    'поздний %s при NEEDS_ATTENTION игнорируется',
    async (kind) => {
      const { service, tx } = withTask(S.NEEDS_ATTENTION);
      const result =
        kind === 'awaiting_manual'
          ? ({ kind } as const)
          : ({ kind, reason: 'r' } as const);
      await expect(service.applyResult('t1', 'tok', result)).resolves.toBe(
        false,
      );
      expect(tx.deliveryTask.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([S.DELIVERED, S.MANUAL_DONE, S.CANCELLED, S.PENDING, S.FAILED])(
    'результат для задания в %s игнорируется даже при совпавшем токене',
    async (status) => {
      const { service, tx } = withTask(status);
      await expect(
        service.applyResult('t1', 'tok', { kind: 'delivered' }),
      ).resolves.toBe(false);
      expect(tx.deliveryTask.updateMany).not.toHaveBeenCalled();
    },
  );

  it('проигранная гонка (updateMany.count = 0): результат не принят', async () => {
    const { service, tx } = withTask(S.IN_PROGRESS);
    tx.deliveryTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.applyResult('t1', 'tok', { kind: 'delivered' }),
    ).resolves.toBe(false);
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });
});

describe('DeliveryService.runClaimed (сбой, тайм-аут, поздний результат)', () => {
  const claimed = {
    id: 't1',
    orderItemId: 'i1',
    step: 1,
    executor: 'command',
    attempts: 1,
    leaseToken: 'tok',
    nick: 'Steve',
    recipientUserId: 'u1',
    renderedCommand: 'say hi',
  };

  function ready() {
    const ctx = setup();
    ctx.prisma.orderItem.findUnique.mockResolvedValue({
      orderId: 'o1',
      quantity: 1,
      product: { decorationId: null },
    });
    const apply = jest
      .spyOn(ctx.service, 'applyResult')
      .mockResolvedValue(true);
    return { ...ctx, apply };
  }

  it('команда ушла: delivered, транспорту передан ключ идемпотентности', async () => {
    const { service, transport, apply } = ready();
    await service.runClaimed(claimed);
    expect(transport.sent).toEqual([
      { command: 'say hi', idempotencyKey: 'i1:1' },
    ]);
    expect(apply).toHaveBeenCalledWith('t1', 'tok', {
      kind: 'delivered',
      externalRef: 'mock-1',
    });
  });

  it('сбой ДО отправки: retry (автоповтор допустим)', async () => {
    const { service, transport, apply } = ready();
    transport.mode = 'not_sent';
    await service.runClaimed(claimed);
    expect(apply.mock.calls[0][2]).toMatchObject({ kind: 'retry' });
  });

  it('разрыв после отправки (ошибка транспорта): unknown, не retry', async () => {
    const { service, transport, apply } = ready();
    transport.mode = 'error';
    await service.runClaimed(claimed);
    expect(apply.mock.calls[0][2]).toMatchObject({ kind: 'unknown' });
  });

  it('тайм-аут неидемпотентного исполнителя: unknown; поздний ответ применяется по токену', async () => {
    const { service, transport, apply } = ready();
    service.timing.executorTimeoutMs = 20;
    transport.mode = 'hang';
    await service.runClaimed(claimed);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][2]).toMatchObject({
      kind: 'unknown',
      reason: 'timeout',
    });
    transport.releaseHanging();
    await new Promise((r) => setTimeout(r, 20));
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[1][1]).toBe('tok');
    expect(apply.mock.calls[1][2]).toMatchObject({ kind: 'delivered' });
  });

  it('команда не отправляется без renderedCommand (в 0.7 шаблонов нет): failed', async () => {
    const { service, transport, apply } = ready();
    await service.runClaimed({ ...claimed, renderedCommand: null });
    expect(transport.sent).toHaveLength(0);
    expect(apply.mock.calls[0][2]).toEqual({
      kind: 'failed',
      reason: 'no_command',
    });
  });

  it('Р9: негодный ник при отправке: failed без отправки', async () => {
    const { service, transport, apply } = ready();
    await service.runClaimed({ ...claimed, nick: '@a' });
    expect(transport.sent).toHaveLength(0);
    expect(apply.mock.calls[0][2]).toEqual({
      kind: 'failed',
      reason: 'invalid_nick',
    });
  });

  it('исключение идемпотентного исполнителя (site): retry', async () => {
    const { service, prisma, apply } = ready();
    prisma.orderItem.findUnique.mockResolvedValue({
      orderId: 'o1',
      quantity: 1,
      product: { decorationId: 'd1' },
    });
    (prisma as unknown as { profileDecoration: unknown }).profileDecoration = {
      findUnique: jest.fn().mockRejectedValue(new Error('db blip')),
    };
    await service.runClaimed({ ...claimed, executor: 'site' });
    expect(apply.mock.calls[0][2]).toMatchObject({ kind: 'retry' });
  });

  it('позиция пропала: failed item_missing; неизвестный исполнитель: failed', async () => {
    const { service, prisma, apply } = ready();
    prisma.orderItem.findUnique.mockResolvedValue(null);
    await service.runClaimed(claimed);
    expect(apply.mock.calls[0][2]).toEqual({
      kind: 'failed',
      reason: 'item_missing',
    });
    await service.runClaimed({ ...claimed, executor: 'bridge' });
    expect(apply.mock.calls[1][2]).toEqual({
      kind: 'failed',
      reason: 'unknown_executor',
    });
  });
});

describe('DeliveryService.recoverExpiredLeases', () => {
  it('идемпотентные (manual, site) возвращаются в PENDING, остальные (command) в NEEDS_ATTENTION', async () => {
    const { service, prisma } = setup();
    await service.recoverExpiredLeases(new Date());
    const [back, attention] = prisma.deliveryTask.updateMany.mock.calls.map(
      (c) => c[0],
    );
    expect(back.data.status).toBe(S.PENDING);
    expect(back.where.executor.in).toEqual(
      expect.arrayContaining(['site', 'manual']),
    );
    expect(back.where.executor.in).not.toContain('command');
    expect(attention.data.status).toBe(S.NEEDS_ATTENTION);
    expect(attention.where.executor.notIn).not.toContain('command');
    expect(attention.where.status).toBe(S.IN_PROGRESS);
  });
});

describe('DeliveryService.assertRefundAllowed (Р4, Р5)', () => {
  it('нет блокирующих заданий: разрешено; строки заданий заблокированы FOR UPDATE', async () => {
    const { service, tx } = setup();
    await expect(
      service.assertRefundAllowed(tx as never, 'o1'),
    ).resolves.toBeUndefined();
    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('FOR UPDATE');
  });

  it('фильтр блокирующих статусов: DELIVERED, MANUAL_DONE, IN_PROGRESS, NEEDS_ATTENTION', async () => {
    const { service, tx } = setup();
    await service.assertRefundAllowed(tx as never, 'o1');
    const where = tx.deliveryTask.findMany.mock.calls[0][0].where;
    expect([...where.status.in].sort()).toEqual(
      [S.DELIVERED, S.MANUAL_DONE, S.IN_PROGRESS, S.NEEDS_ATTENTION].sort(),
    );
  });

  it.each([S.DELIVERED, S.MANUAL_DONE])(
    '%s: 409 refund_after_delivery',
    async (status) => {
      const { service, tx } = setup();
      tx.deliveryTask.findMany.mockResolvedValue([{ status }]);
      await expect(
        service.assertRefundAllowed(tx as never, 'o1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'refund_after_delivery' }),
      });
    },
  );

  it.each([S.IN_PROGRESS, S.NEEDS_ATTENTION])(
    '%s: 409 delivery_in_progress',
    async (status) => {
      const { service, tx } = setup();
      tx.deliveryTask.findMany.mockResolvedValue([{ status }]);
      const err = await service
        .assertRefundAllowed(tx as never, 'o1')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: 'delivery_in_progress',
      });
    },
  );
});

describe('DeliveryService.revokeSiteGrants (вызов из 0.9)', () => {
  it('удаляет только PURCHASE-выдачи этого заказа, снимает выбор, отменяет сайтовые задания', async () => {
    const { service, tx, audit } = setup();
    tx.userDecoration.findMany.mockResolvedValue([
      { id: 'g1', userId: 'u1', decorationId: 'd1' },
    ]);
    tx.deliveryTask.findMany
      .mockResolvedValueOnce([{ id: 't1', orderItemId: 'i1' }])
      .mockResolvedValue([{ status: S.CANCELLED }]);
    await expect(
      service.revokeSiteGrants(tx as never, 'o1', 'admin'),
    ).resolves.toEqual({ revokedDecorations: 1, cancelledTasks: 1 });
    expect(tx.userDecoration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o1', source: 'PURCHASE' } }),
    );
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', selectedDecorationId: 'd1' },
      data: { selectedDecorationId: null },
    });
    expect(tx.userDecoration.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['g1'] } },
    });
    expect(tx.deliveryTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1', status: S.DELIVERED },
        data: expect.objectContaining({ status: S.CANCELLED }),
      }),
    );
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1', isDelivered: true },
      }),
    );
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'delivery.site.revoked' }),
    );
  });

  it('нечего отзывать: ничего не пишется, аудита нет', async () => {
    const { service, tx, audit } = setup();
    await expect(
      service.revokeSiteGrants(tx as never, 'o1', 'admin'),
    ).resolves.toEqual({ revokedDecorations: 0, cancelledTasks: 0 });
    expect(tx.userDecoration.deleteMany).not.toHaveBeenCalled();
    expect(audit.logInTx).not.toHaveBeenCalled();
  });
});

describe('DeliveryService ручные действия админа', () => {
  function locked(status: DeliveryTaskStatus, executor = 'manual') {
    const ctx = setup();
    ctx.tx.deliveryTask.findUniqueOrThrow.mockResolvedValue({
      status,
      orderItemId: 'i1',
      step: 1,
      executor,
    });
    return ctx;
  }

  it('manual-done: пустая причина — 400', async () => {
    const { service } = locked(S.AWAITING_MANUAL);
    await expect(
      service.markManualDone('t1', 'a1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('manual-done из AWAITING_MANUAL: MANUAL_DONE и строгий аудит в транзакции', async () => {
    const { service, tx, audit } = locked(S.AWAITING_MANUAL);
    await service.markManualDone('t1', 'a1', ' выдал в игре ');
    expect(tx.deliveryTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: S.MANUAL_DONE,
          leaseToken: null,
        }),
      }),
    );
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'a1',
        action: 'delivery.task.manual_done',
        changes: expect.objectContaining({
          reason: 'выдал в игре',
          from: S.AWAITING_MANUAL,
          to: S.MANUAL_DONE,
        }),
      }),
    );
  });

  it('manual-done при сбое аудита откатывает транзакцию (ошибка пробрасывается)', async () => {
    const { service, audit } = locked(S.AWAITING_MANUAL);
    audit.logInTx.mockRejectedValueOnce(new Error('audit down'));
    await expect(service.markManualDone('t1', 'a1', 'ok')).rejects.toThrow(
      'audit down',
    );
  });

  it('manual-done: IN_PROGRESS — 409 delivery_in_progress; DELIVERED/CANCELLED — 409', async () => {
    const a = locked(S.IN_PROGRESS);
    await expect(
      a.service.markManualDone('t1', 'a1', 'x'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'delivery_in_progress' }),
    });
    for (const status of [S.DELIVERED, S.MANUAL_DONE, S.CANCELLED]) {
      const b = locked(status);
      await expect(
        b.service.markManualDone('t1', 'a1', 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(b.tx.deliveryTask.update).not.toHaveBeenCalled();
    }
  });

  it('retry без подтверждения — 400 без обращения к БД', async () => {
    const { service, prisma } = locked(S.FAILED);
    await expect(
      service.retryTask('t1', 'a1', { confirmed: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retry из FAILED (site): PENDING; для manual — AWAITING_MANUAL; аудит с confirmed', async () => {
    const a = locked(S.FAILED, 'site');
    await a.service.retryTask('t1', 'a1', {
      confirmed: true,
      reason: 'починили',
    });
    expect(a.tx.deliveryTask.update.mock.calls[0][0].data.status).toBe(
      S.PENDING,
    );
    expect(a.audit.logInTx).toHaveBeenCalledWith(
      a.tx,
      expect.objectContaining({
        action: 'delivery.task.retried',
        changes: expect.objectContaining({
          confirmed: true,
          reason: 'починили',
        }),
      }),
    );
    const b = locked(S.NEEDS_ATTENTION, 'manual');
    await b.service.retryTask('t1', 'a1', { confirmed: true });
    expect(b.tx.deliveryTask.update.mock.calls[0][0].data.status).toBe(
      S.AWAITING_MANUAL,
    );
  });

  it.each([S.DELIVERED, S.MANUAL_DONE, S.IN_PROGRESS, S.PENDING, S.CANCELLED])(
    'retry из %s — 409',
    async (status) => {
      const { service, tx } = locked(status);
      await expect(
        service.retryTask('t1', 'a1', { confirmed: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.deliveryTask.update).not.toHaveBeenCalled();
    },
  );
});

describe('DeliveryService.cancelOpenTasks (возврат, Р5)', () => {
  it('отменяет только невыданные статусы и сбрасывает аренду', async () => {
    const { service, tx } = setup();
    tx.deliveryTask.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(service.cancelOpenTasks(tx as never, 'o1')).resolves.toBe(2);
    const arg = tx.deliveryTask.updateMany.mock.calls[0][0];
    expect([...arg.where.status.in].sort()).toEqual(
      [S.PENDING, S.RETRY_WAIT, S.FAILED, S.AWAITING_MANUAL].sort(),
    );
    expect(arg.where.orderItem).toEqual({ orderId: 'o1' });
    expect(arg.data.status).toBe(S.CANCELLED);
    expect(arg.data.leaseToken).toBeNull();
  });
});

describe('DeliveryService.createTasksAfterPayment (шаг после коммита)', () => {
  it('успех: вставка идёт не в транзакции, возвращает true', async () => {
    const { service, prisma, tx } = setup();
    (prisma as unknown as Record<string, unknown>).order = {
      findUnique: tx.order.findUnique,
    };
    (prisma as unknown as Record<string, unknown>).minecraftAccount =
      tx.minecraftAccount;
    (prisma.deliveryTask as unknown as Record<string, unknown>).createMany =
      tx.deliveryTask.createMany;
    tx.order.findUnique.mockResolvedValue(orderOf());
    await expect(service.createTasksAfterPayment('o1')).resolves.toBe(true);
    expect(tx.deliveryTask.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('сбой вставки не пробрасывается: false (догонит сверка)', async () => {
    const { service, prisma, tx } = setup();
    (prisma as unknown as Record<string, unknown>).order = {
      findUnique: tx.order.findUnique,
    };
    tx.order.findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.createTasksAfterPayment('o1')).resolves.toBe(false);
  });
});

describe('DeliveryService.reconcileMissingTasks (сверка)', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  function withOrders(ids: string[], opts: Opts = {}) {
    const ctx = setup(opts);
    const orderFindMany = jest
      .fn()
      .mockResolvedValue(ids.map((id) => ({ id })));
    (ctx.prisma as unknown as Record<string, unknown>).order = {
      findMany: orderFindMany,
    };
    ctx.tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    ctx.tx.order.findUnique.mockResolvedValue(orderOf());
    return { ...ctx, orderFindMany };
  }

  it('ищет COMPLETED-заказы без заданий в окне, пачкой, старые первыми', async () => {
    const { service, orderFindMany } = withOrders([]);
    await service.reconcileMissingTasks({ now, limit: 7 });
    const arg = orderFindMany.mock.calls[0][0];
    expect(arg.where.status).toBe('COMPLETED');
    expect(arg.where.items).toEqual({
      some: { deliveryTasks: { none: {} } },
    });
    expect(arg.where.paidAt.lte).toEqual(new Date(now.getTime() - 60_000));
    expect(arg.where.paidAt.gte).toEqual(
      new Date(now.getTime() - 72 * 3_600_000),
    );
    expect(arg.take).toBe(7);
    expect(arg.orderBy).toEqual({ paidAt: 'asc' });
  });

  it('создаёт недостающие задания и суммирует число', async () => {
    const { service, tx, prisma } = withOrders(['o1', 'o2']);
    tx.deliveryTask.createMany.mockResolvedValue({ count: 2 });
    await expect(service.reconcileMissingTasks({ now })).resolves.toBe(4);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('чужой advisory lock: заказ пропускается без вставки', async () => {
    const { service, tx } = withOrders(['o1']);
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);
    await expect(service.reconcileMissingTasks({ now })).resolves.toBe(0);
    expect(tx.deliveryTask.createMany).not.toHaveBeenCalled();
  });

  it('сбой одного заказа не мешает остальным', async () => {
    const { service, tx } = withOrders(['bad', 'good']);
    tx.order.findUnique
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(orderOf({ id: 'good' }));
    tx.deliveryTask.createMany.mockResolvedValue({ count: 1 });
    await expect(service.reconcileMissingTasks({ now })).resolves.toBe(1);
  });

  it('env DELIVERY_RECONCILE_ENABLED=false: ничего не делает', async () => {
    const ctx = withOrders(['o1']);
    ctx.config.get.mockImplementation((key: string) =>
      key === 'DELIVERY_RECONCILE_ENABLED' ? false : undefined,
    );
    await expect(ctx.service.reconcileMissingTasks({ now })).resolves.toBe(0);
    expect(ctx.orderFindMany).not.toHaveBeenCalled();
  });
});
