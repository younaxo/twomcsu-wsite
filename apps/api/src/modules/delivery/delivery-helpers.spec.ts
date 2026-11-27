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

  it.each([
    ['Authorization: Bearer abc123def', 'abc123def'],
    ['authorization=Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
    ['Authorization: rawsecret99 failed', 'rawsecret99'],
    ['request failed with Bearer s3cr3t', 's3cr3t'],
    [`Bearer ${'t'.repeat(10)}.${'u'.repeat(60)}`, 'ttttttttttu'],
    ['connect postgres://admin:hunter2@db:5432/x', 'hunter2'],
    ['connect postgres://admin:hunter2@db:5432/x', 'admin'],
    ['redis://:p%40ss@cache:6379', 'p%40ss'],
    ['rcon pass=hunter2', 'hunter2'],
    ['rcon password=hunter2', 'hunter2'],
    ['rcon=hunter2', 'hunter2'],
    ['pwd: hunter2', 'hunter2'],
    ['passwd=hunter2', 'hunter2'],
    ['apikey=hunter2', 'hunter2'],
    ['api_key: hunter2', 'hunter2'],
    ['token=hunter2', 'hunter2'],
    ['secret: hunter2', 'hunter2'],
    ['db_password=hunter2', 'hunter2'],
    ['{"password":"hunter2"}', 'hunter2'],
    ['{"token": "hun ter2 x"}', 'ter2 x'],
    ["{'secret':'hunter2'}", 'hunter2'],
    ['{"rcon":"hunter2","a":1}', 'hunter2'],
    ['password = "hun ter2"', 'ter2'],
    ['{\\"password\\":\\"hunter2\\"}', 'hunter2'],
    ['{\\\\\\"token\\\\\\": \\\\\\"hunter2\\\\\\"}', 'hunter2'],
    ['password%3Dhunter2', 'hunter2'],
    ['password%3ahunter2', 'hunter2'],
    ['x?rcon%3Dhunter2&a=1', 'hunter2'],
    ['%22password%22%3A%22hunter2%22', 'hunter2'],
    ['Authorization: "Bearer abc"', 'abc'],
    ['"Authorization":"Bearer abc"', 'abc'],
    ["Authorization: 'Basic abc'", 'abc'],
    ['BEARER:abc', 'abc'],
    ['bearer: abc', 'abc'],
    ['Authorization%3A%20Bearer abc', 'abc'],
  ])('скрывает секрет: %s', (input, secret) => {
    const text = sanitizeDeliveryError(input);
    expect(text).not.toContain(secret);
    expect(text).toContain('[скрыто]');
  });

  it('обычный текст ошибки сохраняется', () => {
    expect(sanitizeDeliveryError('ECONNREFUSED 127.0.0.1:25575')).toBe(
      'ECONNREFUSED 127.0.0.1:25575',
    );
    expect(sanitizeDeliveryError('tests passed: 5')).toBe('tests passed: 5');
    expect(sanitizeDeliveryError('player "Steve" not found: 404')).toBe(
      'player "Steve" not found: 404',
    );
  });

  it('длинный ввод с экранированием, процентами и bearer обрабатывается быстро', () => {
    const started = Date.now();
    const evil = '\\"%3A%3D bearer: authorization:"'.repeat(200_000);
    const text = sanitizeDeliveryError(evil);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(text.length).toBeLessThanOrEqual(300);
  });

  // Вход режется до первых 4000 символов (SANITIZE_INPUT_LIMIT в
  // delivery-status.ts, константа не экспортируется), поэтому 50k и 200k
  // символов - одна и та же операция; сравнивать их по времени бессмысленно.
  // Здесь проверяются сам лимит и худшие формы входа на длине ровно лимита.
  const INPUT_LIMIT = 4000;
  const fill = (unit: string): string =>
    unit.repeat(Math.ceil(INPUT_LIMIT / unit.length)).slice(0, INPUT_LIMIT);

  it('лимит разбора: символы после 4000-го отбрасываются, до него сохраняются', () => {
    // Цепочка обратных слэшей схлопывается в одну кавычку, поэтому метки
    // видны в итоговых 300 символах. KEEP заканчивается ровно на 4000-м
    // символе (остаётся), всё с 4001-го отбрасывается.
    const head = `${'\\'.repeat(INPUT_LIMIT - 5)}"KEEP`;
    expect(head.length).toBe(INPUT_LIMIT);
    expect(sanitizeDeliveryError(`${head}DROP`)).toBe('"KEEP');
    // Секрет за пределом лимита не разбирается и не попадает в итог.
    expect(sanitizeDeliveryError(`${head} password=hunter2`)).toBe('"KEEP');
    // Секрет внутри лимита скрывается.
    const text = sanitizeDeliveryError(
      `${'\\'.repeat(INPUT_LIMIT - 40)}" password=hunter2 end`,
    );
    expect(text).not.toContain('hunter2');
    expect(text).toContain('[скрыто]');
  });

  it('огромное сообщение обрезается до итоговых 300 символов', () => {
    expect(
      sanitizeDeliveryError('x y '.repeat(500_000)).length,
    ).toBeLessThanOrEqual(300);
  });

  // Защита от катастрофического backtracking: на длине лимита квадратичный
  // разбор дал бы секунды. Порог абсолютный с большим запасом над обычными
  // единицами-десятками мс, по медиане трёх прогонов, чтобы шум CI (GC,
  // соседние задания) не ронял тест.
  const RUNS = 3;
  const ABSOLUTE_LIMIT_MS = 1500;
  it.each([
    ['a x N', fill('a')],
    ['http:// + a x N', `http://${fill('a').slice(7)}`],
    ['цепочка обратных слэшей', fill('\\')],
    ['цепочка слэшей с кавычкой', `${fill('\\').slice(1)}"`],
    ['цепочка %3D', fill('%3D')],
    ['key= x N', fill('key=')],
    [
      'экранирование, проценты, bearer',
      fill('\\"%3A%3D bearer: authorization:"'),
    ],
  ])(
    'худшая форма входа на длине лимита быстрая: %s',
    (_name, input) => {
      expect(input.length).toBe(INPUT_LIMIT);
      const samples: number[] = [];
      for (let i = 0; i < RUNS; i += 1) {
        const started = performance.now();
        const text = sanitizeDeliveryError(input);
        samples.push(performance.now() - started);
        expect(text.length).toBeLessThanOrEqual(300);
      }
      samples.sort((a, b) => a - b);
      expect(samples[1]).toBeLessThan(ABSOLUTE_LIMIT_MS);
    },
    15000,
  );
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
