/// Тестовая память вместо БД для журнала кошелька (только для spec-файлов).
/// Имитирует: уникальный ключ идемпотентности, строку кошелька, агрегаты и
/// последовательное исполнение транзакций (мьютекс вместо `FOR UPDATE`).
export interface FakeEntry {
  id: string;
  userId: string;
  currency: 'RUBY';
  amount: bigint;
  balanceAfter: bigint;
  kind: string;
  idempotencyKey: string;
  reason: string | null;
  actorId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  refundId: string | null;
  createdAt: Date;
}

export function createFakeDb() {
  const entries: FakeEntry[] = [];
  const balances = new Map<string, bigint>();
  let seq = 0;
  /// Заказы (по умолчанию COMPLETED), активные возвраты, позиции (по умолчанию
  /// 1 ₽ за штуку при 100 шт.) и журнал порядка блокировок.
  const orders = new Map<string, { status: string }>();
  const activeRefunds = new Set<string>();
  const items = new Map<string, { unitPrice: string; totalPrice: string }>();
  const locks: string[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  const matches = (e: FakeEntry, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      const value = (e as unknown as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'in' in (v as object)) {
        return (v as { in: unknown[] }).in.includes(value);
      }
      return value === v;
    });

  // Шаблонные теги: распознаём операции по тексту SQL.
  const sqlText = (strings: TemplateStringsArray) => strings.join('?');

  const tx = {
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = sqlText(strings);
        if (text.includes('INSERT INTO wallets')) {
          const userId = values[0] as string;
          if (!balances.has(userId)) balances.set(userId, 0n);
        } else if (text.includes('UPDATE wallets')) {
          balances.set(values[1] as string, values[0] as bigint);
        }
        return Promise.resolve(1);
      },
    ),
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = sqlText(strings);
        if (text.includes('FROM wallet_ledger_entries')) {
          const total = entries
            .filter((e) => e.kind === 'ADMIN_ADJUST' && e.actorId === values[0])
            .reduce(
              (sum, e) => sum + (e.amount < 0n ? -e.amount : e.amount),
              0n,
            );
          return Promise.resolve([{ total }]);
        }
        if (text.includes('FROM orders')) {
          locks.push('order');
          const id = values[0] as string;
          return Promise.resolve([
            { id, status: orders.get(id)?.status ?? 'COMPLETED' },
          ]);
        }
        if (text.includes('FROM wallets')) {
          locks.push('wallet');
          const b = balances.get(values[0] as string);
          return Promise.resolve(b === undefined ? [] : [{ balance: b }]);
        }
        return Promise.resolve([]);
      },
    ),
    orderRefund: {
      findFirst: jest.fn(({ where }: { where: { orderId: string } }) =>
        Promise.resolve(
          activeRefunds.has(where.orderId) ? { id: 'r-active' } : null,
        ),
      ),
    },
    orderItem: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          items.get(where.id) ?? { unitPrice: '1.00', totalPrice: '100.00' },
        ),
      ),
    },
    walletLedgerEntry: {
      findUnique: jest.fn(({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(
          entries.find((e) => e.idempotencyKey === where.idempotencyKey) ??
            null,
        ),
      ),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(entries.find((e) => matches(e, where)) ?? null),
      ),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(entries.filter((e) => matches(e, where))),
      ),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(entries.filter((e) => matches(e, where)).length),
      ),
      aggregate: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const rows = entries.filter((e) => matches(e, where));
        return Promise.resolve({
          _sum: {
            amount: rows.length
              ? rows.reduce((s, e) => s + e.amount, 0n)
              : null,
          },
        });
      }),
      groupBy: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const rows = entries.filter((e) => matches(e, where));
        const kinds = [...new Set(rows.map((r) => r.kind))];
        return Promise.resolve(
          kinds.map((kind) => ({
            kind,
            _sum: {
              amount: rows
                .filter((r) => r.kind === kind)
                .reduce((s, e) => s + e.amount, 0n),
            },
          })),
        );
      }),
      create: jest.fn(
        ({ data }: { data: Omit<FakeEntry, 'id' | 'createdAt'> }) => {
          if (entries.some((e) => e.idempotencyKey === data.idempotencyKey)) {
            return Promise.reject(new Error('P2002 unique idempotencyKey'));
          }
          const entry = { ...data, id: `e${++seq}`, createdAt: new Date() };
          entries.push(entry);
          return Promise.resolve(entry);
        },
      ),
    },
  };

  const prisma = {
    ...tx,
    wallet: {
      findUnique: jest.fn(
        ({ where }: { where: { userId_currency: { userId: string } } }) =>
          Promise.resolve(
            balances.has(where.userId_currency.userId)
              ? { balance: balances.get(where.userId_currency.userId) }
              : null,
          ),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
    /// Транзакции идут строго по очереди — как сериализация на `FOR UPDATE`.
    $transaction: <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      const run = queue.then(() => fn(tx));
      queue = run.catch(() => undefined);
      return run;
    },
  };

  return { entries, balances, orders, activeRefunds, items, locks, tx, prisma };
}
