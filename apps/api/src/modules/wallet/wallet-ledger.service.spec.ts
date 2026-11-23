import { createFakeDb } from '../../../test/helpers/wallet-fake-db';
import { WalletLedgerService } from './wallet-ledger.service';

function setup(enabled = true) {
  const db = createFakeDb();
  const config = {
    get: jest.fn((k: string) =>
      k === 'WALLET_LEDGER_ENABLED' ? enabled : undefined,
    ),
  };
  const service = new WalletLedgerService(db.prisma as never, config as never);
  const post = (over: Record<string, unknown> = {}) =>
    db.prisma.$transaction((tx) =>
      service.post(tx as never, {
        userId: 'u1',
        amount: 100n,
        kind: 'PURCHASE',
        idempotencyKey: 'k1',
        ...over,
      }),
    );
  return { service, db, post };
}

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return (e as { getResponse?: () => { code?: string } }).getResponse?.()
      ?.code;
  }
  return undefined;
}

describe('WalletLedgerService (0.15)', () => {
  it('зачисление: проводка, balanceAfter, баланс = сумма журнала', async () => {
    const { db, post, service } = setup();
    const r = await post();
    expect(r.created).toBe(true);
    expect(r.entry.balanceAfter).toBe(100n);
    expect(db.balances.get('u1')).toBe(100n);
    await expect(service.sumLedger(db.prisma as never, 'u1')).resolves.toBe(
      100n,
    );
  });

  it('идемпотентность: тот же ключ не зачисляет вторично', async () => {
    const { db, post } = setup();
    await post();
    const again = await post();
    expect(again.created).toBe(false);
    expect(db.entries).toHaveLength(1);
    expect(db.balances.get('u1')).toBe(100n);
  });

  it('идемпотентность: тот же ключ с другой суммой — конфликт', async () => {
    const { post } = setup();
    await post();
    expect(await code(post({ amount: 5n }))).toBe(
      'wallet_idempotency_conflict',
    );
  });

  it('параллельные повторы одной покупки: одна проводка', async () => {
    const { db, post } = setup();
    const results = await Promise.all([post(), post(), post(), post()]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(db.entries).toHaveLength(1);
    expect(db.balances.get('u1')).toBe(100n);
  });

  it('параллельные списания не уводят в минус', async () => {
    const { db, post, service } = setup();
    await post();
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        post({
          amount: -30n,
          kind: 'ADMIN_ADJUST',
          idempotencyKey: `d${i}`,
        }),
      ),
    );
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(3);
    expect(db.balances.get('u1')).toBe(10n);
    expect(db.entries.every((e) => e.balanceAfter >= 0n)).toBe(true);
    // Баланс = сумма журнала, balanceAfter последней проводки = баланс.
    const sum = db.entries.reduce((s, e) => s + e.amount, 0n);
    expect(sum).toBe(db.balances.get('u1'));
    expect(db.entries[db.entries.length - 1].balanceAfter).toBe(sum);
    await expect(service.reconcile('u1')).resolves.toMatchObject({
      consistent: true,
    });
  });

  it('отрицательный баланс невозможен: 409 wallet_insufficient, журнал не растёт', async () => {
    const { db, post } = setup();
    await post({ amount: 10n });
    expect(
      await code(
        post({ amount: -11n, kind: 'ADMIN_ADJUST', idempotencyKey: 'k2' }),
      ),
    ).toBe('wallet_insufficient');
    expect(db.entries).toHaveLength(1);
    expect(db.balances.get('u1')).toBe(10n);
  });

  it('расхождение баланса и журнала — отказ wallet_inconsistent, запись не идёт', async () => {
    const { db, post } = setup();
    await post({ amount: 10n });
    db.balances.set('u1', 999n); // порча материализованного баланса
    expect(await code(post({ idempotencyKey: 'k2' }))).toBe(
      'wallet_inconsistent',
    );
    expect(db.entries).toHaveLength(1);
  });

  it('нулевая проводка отклоняется', async () => {
    const { post } = setup();
    await expect(post({ amount: 0n })).rejects.toThrow('wallet_zero_amount');
  });

  it('журнал не меняется кодом: только create, без update/delete', async () => {
    const { db, post } = setup();
    await post();
    const methods = Object.keys(db.tx.walletLedgerEntry);
    expect(methods.some((m) => /update|delete|upsert/i.test(m))).toBe(false);
  });

  it('флаг: выкл. по умолчанию -> assertEnabled 503 wallet_disabled', () => {
    const { service } = setup(false);
    expect(service.isEnabled()).toBe(false);
    expect(() => service.assertEnabled()).toThrow();
    try {
      service.assertEnabled();
    } catch (e) {
      expect((e as { getStatus(): number }).getStatus()).toBe(503);
      expect(
        (e as { getResponse(): { code: string } }).getResponse().code,
      ).toBe('wallet_disabled');
    }
  });

  describe('возврат (REFUND_REVERSAL / REFUND_RESTORE)', () => {
    it('сводка по заказу: зачислено и остаток', async () => {
      const { db, post, service } = setup();
      await post({ orderId: 'o1', orderItemId: 'i1' });
      await post({
        amount: -40n,
        kind: 'REFUND_REVERSAL',
        idempotencyKey: 'r1',
        orderId: 'o1',
        refundId: 'rf1',
      });
      const s = await service.orderCreditSummary(db.tx as never, 'o1');
      expect(s).toEqual({ credited: 100n, net: 60n });
    });

    it('списание под возврат и откат при FAILED; повторы безопасны', async () => {
      const { db, post, service } = setup();
      await post({ orderId: 'o1', orderItemId: 'i1' });
      const reverse = () =>
        db.prisma.$transaction((tx) =>
          service.reverseForRefund(tx as never, {
            userId: 'u1',
            orderId: 'o1',
            refundId: 'rf1',
            needed: 100n,
            actorId: 'a1',
            reason: 'x',
          }),
        );
      const first = await reverse();
      expect(first?.entry.amount).toBe(-100n);
      expect(db.balances.get('u1')).toBe(0n);
      // Повтор при активном списании ничего не пишет.
      expect(await reverse()).toBeNull();
      expect(db.entries).toHaveLength(2);

      const restore = () =>
        db.prisma.$transaction((tx) =>
          service.restoreForRefund(tx as never, 'rf1', 'a1'),
        );
      expect(await restore()).toBe(1);
      expect(db.balances.get('u1')).toBe(100n);
      expect(await restore()).toBe(0); // уже откачено
      expect(db.entries).toHaveLength(3);
      // После отката можно списать снова (новый ключ).
      const second = await reverse();
      expect(second?.entry.idempotencyKey).toBe('refund-reversal:rf1:2');
      expect(db.balances.get('u1')).toBe(0n);
    });

    it('списание больше баланса -> wallet_insufficient', async () => {
      const { db, post, service } = setup();
      await post({ orderId: 'o1', amount: 50n });
      const run = db.prisma.$transaction((tx) =>
        service.reverseForRefund(tx as never, {
          userId: 'u1',
          orderId: 'o1',
          refundId: 'rf1',
          needed: 80n,
          actorId: 'a1',
          reason: 'x',
        }),
      );
      expect(await code(run)).toBe('wallet_insufficient');
      expect(db.balances.get('u1')).toBe(50n);
    });
  });

  describe('OPENING_BALANCE (бэкфилл прежних балансов)', () => {
    const open = (
      db: ReturnType<typeof createFakeDb>,
      service: WalletLedgerService,
    ) =>
      db.prisma.$transaction((tx) =>
        service.postOpeningBalance(tx as never, 'u1', 'owner'),
      );

    it('сводит прежний баланс с журналом, идемпотентно, баланс не меняется', async () => {
      const { service, db, post } = setup();
      db.balances.set('u1', 70n);
      // до сведения запись в кошелёк отклоняется
      expect(await code(post())).toBe('wallet_inconsistent');
      const res = await open(db, service);
      expect(res?.created).toBe(true);
      expect(db.entries[0]).toMatchObject({
        kind: 'OPENING_BALANCE',
        amount: 70n,
        balanceAfter: 70n,
        idempotencyKey: 'opening-balance:u1',
      });
      expect(db.balances.get('u1')).toBe(70n);
      const again = await open(db, service);
      expect(again?.created).toBe(false);
      expect(db.entries).toHaveLength(1);
      // после сведения обычные проводки работают
      await post();
      expect(db.balances.get('u1')).toBe(170n);
    });

    it('уже сходится — ничего не пишет; журнал выше баланса — wallet_inconsistent', async () => {
      const { service, db, post } = setup();
      await post();
      expect(await open(db, service)).toBeNull();
      db.balances.set('u1', 10n);
      expect(await code(open(db, service))).toBe('wallet_inconsistent');
    });
  });
});
