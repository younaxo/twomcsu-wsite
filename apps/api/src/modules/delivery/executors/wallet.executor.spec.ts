import { createFakeDb } from '../../../../test/helpers/wallet-fake-db';
import { WalletLedgerService } from '../../wallet/wallet-ledger.service';
import { DeliveryTaskSnapshot } from '../delivery-executor.interface';
import { WalletExecutor } from './wallet.executor';

function setup(enabled = true) {
  const db = createFakeDb();
  const config = {
    get: jest.fn((k: string) =>
      k === 'WALLET_LEDGER_ENABLED' ? enabled : undefined,
    ),
  };
  const ledger = new WalletLedgerService(db.prisma as never, config as never);
  const executor = new WalletExecutor(db.prisma as never, ledger);
  return { executor, db };
}

const task = (
  over: Partial<DeliveryTaskSnapshot> = {},
): DeliveryTaskSnapshot => ({
  taskId: 't1',
  orderItemId: 'i1',
  orderId: 'o1',
  step: 1,
  executor: 'wallet',
  attempt: 1,
  idempotencyKey: 'i1:1',
  nick: null,
  recipientUserId: 'u1',
  quantity: 100,
  decorationId: null,
  renderedCommand: null,
  ...over,
});

describe('WalletExecutor (0.15)', () => {
  it('зачисляет quantity рубинов (1 ₽ = 1 рубин) одной проводкой PURCHASE', async () => {
    const { executor, db } = setup();
    const res = await executor.execute(task());
    expect(res.kind).toBe('delivered');
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0]).toMatchObject({
      kind: 'PURCHASE',
      amount: 100n,
      balanceAfter: 100n,
      idempotencyKey: 'purchase:i1:1',
      orderId: 'o1',
      orderItemId: 'i1',
    });
    expect(db.balances.get('u1')).toBe(100n);
  });

  it('повтор задания или вебхука не зачисляет вторично', async () => {
    const { executor, db } = setup();
    const first = await executor.execute(task());
    const again = await executor.execute(task({ attempt: 2 }));
    const parallel = await Promise.all([
      executor.execute(task()),
      executor.execute(task()),
    ]);
    expect(first).toEqual(again);
    expect(parallel.every((r) => r.kind === 'delivered')).toBe(true);
    expect(db.entries).toHaveLength(1);
    expect(db.balances.get('u1')).toBe(100n);
  });

  it('флаг выкл.: не зачисляет, задание уходит в ручную выдачу', async () => {
    const { executor, db } = setup(false);
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'awaiting_manual',
    });
    expect(db.entries).toHaveLength(0);
  });

  it('без получателя-пользователя и с неверным количеством — failed', async () => {
    const { executor, db } = setup();
    await expect(
      executor.execute(task({ recipientUserId: null })),
    ).resolves.toEqual({ kind: 'failed', reason: 'recipient_not_registered' });
    await expect(executor.execute(task({ quantity: 0 }))).resolves.toEqual({
      kind: 'failed',
      reason: 'quantity_invalid',
    });
    expect(db.entries).toHaveLength(0);
  });

  it('получатель не найден — failed без проводки', async () => {
    const { executor, db } = setup();
    db.prisma.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'failed',
      reason: 'recipient_not_found',
    });
    expect(db.entries).toHaveLength(0);
  });

  it('блокировка заказа раньше кошелька (общий порядок с возвратом)', async () => {
    const { executor, db } = setup();
    await executor.execute(task());
    expect(db.locks).toEqual(['order', 'wallet']);
  });

  it.each(['REFUND_PENDING', 'REFUNDED'])(
    'заказ в статусе %s: рубины не зачисляются (failed)',
    async (status) => {
      const { executor, db } = setup();
      db.orders.set('o1', { status });
      await expect(executor.execute(task())).resolves.toEqual({
        kind: 'failed',
        reason: 'order_refund_in_progress',
      });
      expect(db.entries).toHaveLength(0);
      expect(db.locks).toEqual(['order']);
    },
  );

  it('заказ не оплачен (PENDING): не зачисляет', async () => {
    const { executor, db } = setup();
    db.orders.set('o1', { status: 'PENDING' });
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'failed',
      reason: 'order_not_paid',
    });
    expect(db.entries).toHaveLength(0);
  });

  it('активный возврат при статусе COMPLETED: не зачисляет', async () => {
    const { executor, db } = setup();
    db.activeRefunds.add('o1');
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'failed',
      reason: 'order_refund_in_progress',
    });
    expect(db.entries).toHaveLength(0);
  });

  it('последовательность: зачисление, затем возврат не мешает; возврат, затем зачисление отклонено', async () => {
    const { executor, db } = setup();
    expect((await executor.execute(task())).kind).toBe('delivered');
    // Возврат стартовал (заказ REFUND_PENDING): повтор задания идемпотентен
    // только если проводка уже есть; для новой позиции зачисления нет.
    db.orders.set('o1', { status: 'REFUND_PENDING' });
    const other = await executor.execute(
      task({ orderItemId: 'i2', idempotencyKey: 'i2:1' }),
    );
    expect(other).toEqual({
      kind: 'failed',
      reason: 'order_refund_in_progress',
    });
    expect(db.entries).toHaveLength(1);
    expect(db.balances.get('u1')).toBe(100n);
    // Повтор уже проведённой позиции — не отказ, а прежняя проводка.
    expect((await executor.execute(task())).kind).toBe('delivered');
    expect(db.entries).toHaveLength(1);
  });

  it('цена позиции не равна количеству рубинов: currency_price_mismatch, без проводки', async () => {
    const { executor, db } = setup();
    db.items.set('i1', { unitPrice: '1.00', totalPrice: '50.00' });
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'unknown',
      reason: 'currency_price_mismatch',
    });
    db.items.set('i1', { unitPrice: '2.00', totalPrice: '100.00' });
    await expect(executor.execute(task())).resolves.toEqual({
      kind: 'unknown',
      reason: 'currency_price_mismatch',
    });
    expect(db.entries).toHaveLength(0);
  });
});
