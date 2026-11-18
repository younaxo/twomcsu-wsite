import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { DeliveryTaskStatus } from '@prisma/client';
import { isDeliverableNick } from './delivery-nick';
import { buyerDeliveryStatus, sanitizeDeliveryError } from './delivery-status';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';
import { toBuyerOrder } from '../store/orders.service';

const S = DeliveryTaskStatus;

describe('isDeliverableNick (Р9)', () => {
  it.each(['Steve', 'a_b', 'Abc123', 'x'.repeat(16)])('годный %p', (n) => {
    expect(isDeliverableNick(n)).toBe(true);
  });
  it.each([
    'ab',
    'x'.repeat(17),
    'a b',
    'a.b',
    'all',
    'All',
    '*',
    '@a',
    '@e',
    '@p',
    '@r',
    '@s',
    'a;b',
    'a\nb',
    '',
    null,
    undefined,
    42,
  ])('негодный %p', (n) => {
    expect(isDeliverableNick(n)).toBe(false);
  });
});

describe('buyerDeliveryStatus', () => {
  it('нет заданий и только отменённые: pending', () => {
    expect(buyerDeliveryStatus([])).toBe('pending');
    expect(buyerDeliveryStatus([S.CANCELLED])).toBe('pending');
  });
  it('все выданы (DELIVERED/MANUAL_DONE): delivered', () => {
    expect(buyerDeliveryStatus([S.DELIVERED, S.MANUAL_DONE])).toBe('delivered');
  });
  it('FAILED или NEEDS_ATTENTION: failed', () => {
    expect(buyerDeliveryStatus([S.DELIVERED, S.FAILED])).toBe('failed');
    expect(buyerDeliveryStatus([S.NEEDS_ATTENTION])).toBe('failed');
  });
  it.each([S.PENDING, S.IN_PROGRESS, S.RETRY_WAIT, S.AWAITING_MANUAL])(
    '%s: pending',
    (s) => {
      expect(buyerDeliveryStatus([s])).toBe('pending');
      expect(buyerDeliveryStatus([S.DELIVERED, s])).toBe('pending');
    },
  );
});

describe('sanitizeDeliveryError', () => {
  it('убирает токены и длинные непрозрачные строки, схлопывает переводы строк', () => {
    const text = sanitizeDeliveryError(
      new Error(
        'bad password=hunter2 and key: abc\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    );
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('AAAAAAAAAAAAAAAA');
    expect(text).not.toContain('\n');
  });
  it('длина не больше 300', () => {
    expect(
      sanitizeDeliveryError('x y '.repeat(200)).length,
    ).toBeLessThanOrEqual(300);
  });
});

describe('ManualExecutor', () => {
  it('ждёт человека и воркером не берётся', async () => {
    const e = new ManualExecutor();
    expect(e.automatic).toBe(false);
    await expect(e.execute({} as never)).resolves.toEqual({
      kind: 'awaiting_manual',
    });
  });
});

describe('SiteExecutor', () => {
  const snapshot = {
    orderId: 'o1',
    recipientUserId: 'u1',
    decorationId: 'd1',
  } as never;

  function build(over: Record<string, unknown> = {}) {
    const prisma = {
      profileDecoration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'd1' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      userDecoration: { upsert: jest.fn().mockResolvedValue({}) },
      ...over,
    };
    return { prisma, executor: new SiteExecutor(prisma as never) };
  }

  it('выдаёт украшение с источником PURCHASE и номером заказа, идемпотентно (update: {})', async () => {
    const { prisma, executor } = build();
    await expect(executor.execute(snapshot)).resolves.toEqual({
      kind: 'delivered',
    });
    expect(prisma.userDecoration.upsert).toHaveBeenCalledWith({
      where: { userId_decorationId: { userId: 'u1', decorationId: 'd1' } },
      create: {
        userId: 'u1',
        decorationId: 'd1',
        source: 'PURCHASE',
        orderId: 'o1',
      },
      update: {},
    });
  });

  it('без украшения, без получателя или с исчезнувшим украшением: failed, записи нет', async () => {
    const { prisma, executor } = build();
    await expect(
      executor.execute({
        ...(snapshot as object),
        decorationId: null,
      } as never),
    ).resolves.toMatchObject({ kind: 'failed', reason: 'decoration_missing' });
    await expect(
      executor.execute({
        ...(snapshot as object),
        recipientUserId: null,
      } as never),
    ).resolves.toMatchObject({
      kind: 'failed',
      reason: 'recipient_not_registered',
    });
    prisma.profileDecoration.findUnique.mockResolvedValue(null);
    await expect(executor.execute(snapshot)).resolves.toMatchObject({
      kind: 'failed',
    });
    expect(prisma.userDecoration.upsert).not.toHaveBeenCalled();
  });
});

describe('toBuyerOrder: статус выдачи покупателю (0.7)', () => {
  const base = {
    id: 'o1',
    status: 'COMPLETED',
    paymentId: 'p',
    paymentProvider: 'test',
    items: [
      { id: 'i1', deliveryTasks: [{ status: S.DELIVERED }] },
      { id: 'i2', deliveryTasks: [{ status: S.AWAITING_MANUAL }] },
    ],
  };

  it('позиции и заказ получают pending/delivered/failed, deliveryTasks не отдаётся', () => {
    const order = toBuyerOrder(base) as unknown as {
      deliveryStatus: string;
      items: Array<Record<string, unknown>>;
    };
    expect(order.items.map((i) => i.deliveryStatus)).toEqual([
      'delivered',
      'pending',
    ]);
    expect(order.deliveryStatus).toBe('pending');
    for (const item of order.items)
      expect(item).not.toHaveProperty('deliveryTasks');
    expect(order).not.toHaveProperty('paymentId');
  });

  it('всё выдано: delivered; сбой: failed; без деталей (только строка-статус)', () => {
    const done = toBuyerOrder({
      status: 'COMPLETED',
      items: [{ deliveryTasks: [{ status: S.MANUAL_DONE }] }],
    }) as unknown as { deliveryStatus: string };
    expect(done.deliveryStatus).toBe('delivered');
    const bad = toBuyerOrder({
      status: 'COMPLETED',
      items: [{ deliveryTasks: [{ status: S.NEEDS_ATTENTION }] }],
    }) as unknown as { deliveryStatus: string };
    expect(bad.deliveryStatus).toBe('failed');
  });

  it('незавершённый заказ: deliveryStatus = null', () => {
    const pending = toBuyerOrder({
      status: 'PENDING',
      items: [{ deliveryTasks: [] }],
    }) as unknown as {
      deliveryStatus: unknown;
      items: Array<{ deliveryStatus: unknown }>;
    };
    expect(pending.deliveryStatus).toBeNull();
    expect(pending.items[0].deliveryStatus).toBeNull();
  });
});

/// ADR-0184 Р1: слой доставки не читает `Product.gameCommands`. Проверка по
/// исходникам: слово не должно встречаться в коде (только в комментариях).
describe('Р1: слой доставки не читает Product.gameCommands', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
  }

  it('в коде модуля delivery нет обращений к gameCommands', () => {
    const offending: string[] = [];
    for (const file of sources(__dirname)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, idx) => {
          const code = line.trim();
          const isComment =
            code.startsWith('//') ||
            code.startsWith('*') ||
            code.startsWith('/*');
          if (!isComment && code.includes('gameCommands')) {
            offending.push(`${file}:${idx + 1}`);
          }
        });
    }
    expect(offending).toEqual([]);
  });

  it('DTO товара не принимает gameCommands', () => {
    for (const name of ['create-product.dto.ts', 'update-product.dto.ts']) {
      const text = readFileSync(
        join(__dirname, '..', 'store', 'dto', name),
        'utf8',
      );
      const code = text
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(code).not.toContain('gameCommands');
    }
  });
});
