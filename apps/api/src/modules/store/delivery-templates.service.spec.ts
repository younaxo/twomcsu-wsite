import { HttpException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { DeliveryTemplatesAdminController } from './delivery-templates-admin.controller';
import { DeliveryTemplatesService } from './delivery-templates.service';
import {
  StoreSettingsAdminController,
  StoreTextsController,
} from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';

interface Row {
  id: string;
  productId: string;
  variantId: string | null;
  scopeKey: string;
  template: string;
  version: number;
  updatedBy: string | null;
}

function setup(
  opts: {
    twoFactor?: 'totp' | 'backup' | null;
    fails?: number;
    extraRoots?: string;
  } = {},
) {
  const rows = new Map<string, Row>();
  const tx = {
    siteSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    deliveryCommandTemplate: {
      findUnique: jest.fn(async ({ where }: { where: { scopeKey: string } }) =>
        rows.get(where.scopeKey) ? { ...rows.get(where.scopeKey)! } : null,
      ),
      create: jest.fn(
        async ({ data }: { data: Omit<Row, 'id' | 'version'> }) => {
          const row = { id: 't1', version: 1, ...data } as Row;
          rows.set(row.scopeKey, row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { scopeKey: string };
          data: { template: string; updatedBy: string };
        }) => {
          const row = rows.get(where.scopeKey)!;
          row.template = data.template;
          row.updatedBy = data.updatedBy;
          row.version += 1;
          return row;
        },
      ),
    },
  };
  const prisma = {
    product: {
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === 'p1' ? { id: 'p1', slug: 'ares' } : null,
        ),
    },
    productVariant: {
      findFirst: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === 'v1' ? { id: 'v1' } : null,
        ),
    },
    deliveryCommandTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    siteSetting: {
      findUnique: jest.fn(async () =>
        opts.extraRoots ? { value: opts.extraRoots } : null,
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const twoFactor = {
    verify: jest
      .fn()
      .mockResolvedValue(
        opts.twoFactor === undefined ? 'totp' : opts.twoFactor,
      ),
  };
  const counters = new Map<string, number>();
  if (opts.fails) counters.set('store:template:2fa-fail:a1', opts.fails);
  const redis = {
    client: {
      get: jest.fn(async (k: string) => counters.get(k) ?? null),
      eval: jest.fn(async (_script: string, _n: number, k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return counters.get(k);
      }),
      del: jest.fn(async (k: string) => {
        counters.delete(k);
      }),
    },
  };
  const service = new DeliveryTemplatesService(
    prisma as never,
    audit as never,
    twoFactor as never,
    redis as never,
  );
  return { service, prisma, audit, twoFactor, redis, rows, tx };
}

const dto = (over: Record<string, unknown> = {}) => ({
  template: 'lp user {username} parent addtemp ares {duration}',
  twoFactorCode: '123456',
  ...over,
});

async function status(p: Promise<unknown>): Promise<number | string> {
  try {
    await p;
    return 'ok';
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

describe('DeliveryTemplatesService (0.11)', () => {
  it('создаёт шаблон, версия 1, аудит со значением до/после', async () => {
    const s = setup();
    const saved = await s.service.upsert('p1', dto() as never, 'a1');
    expect(saved.version).toBe(1);
    expect(s.rows.get('p1:*')?.template).toContain('{username}');
    expect(s.audit.logInTx).toHaveBeenCalledTimes(1);
    const entry = s.audit.logInTx.mock.calls[0][1];
    expect(entry.action).toBe('store.delivery.template.updated');
    expect(entry.severity).toBe('critical');
    expect(entry.actorId).toBe('a1');
    expect(entry.changes.before).toBeNull();
    expect(entry.changes.after.version).toBe(1);
  });

  it('изменение: версия растёт, в аудите старое и новое значение', async () => {
    const s = setup();
    await s.service.upsert('p1', dto() as never, 'a1');
    await s.service.upsert(
      'p1',
      dto({ template: 'give {username} diamond 1' }) as never,
      'a1',
    );
    const entry = s.audit.logInTx.mock.calls[1][1];
    expect(entry.changes.before.template).toContain('addtemp');
    expect(entry.changes.after.template).toBe('give {username} diamond 1');
    expect(entry.changes.after.version).toBe(2);
  });

  it('шаблон варианта хранится отдельно от шаблона товара', async () => {
    const s = setup();
    await s.service.upsert('p1', dto({ variantId: 'v1' }) as never, 'a1');
    expect(s.rows.has('p1:v1')).toBe(true);
    expect(s.rows.has('p1:*')).toBe(false);
  });

  it.each([
    'give {username}; op {username}',
    'give {username}\nstop',
    'give {nick}',
    'give now',
  ])('плохой шаблон %j: 400, 2FA не тратится, записи нет', async (template) => {
    const s = setup();
    expect(
      await status(s.service.upsert('p1', dto({ template }) as never, 'a1')),
    ).toBe(400);
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(s.rows.size).toBe(0);
    expect(s.audit.logInTx).not.toHaveBeenCalled();
  });

  it('несуществующий товар/вариант: 404 ДО 2FA, код не тратится', async () => {
    const s = setup();
    expect(await status(s.service.upsert('nope', dto() as never, 'a1'))).toBe(
      404,
    );
    expect(
      await status(
        s.service.upsert('p1', dto({ variantId: 'zzz' }) as never, 'a1'),
      ),
    ).toBe(404);
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(s.redis.client.eval).not.toHaveBeenCalled();
  });

  it('корень вне белого списка: 400, 2FA не тратится; расширение разрешает', async () => {
    const s = setup();
    const t = dto({ template: 'unban {username}' }) as never;
    expect(await status(s.service.upsert('p1', t, 'a1'))).toBe(400);
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    const s2 = setup({ extraRoots: 'unban' });
    await s2.service.upsert('p1', t, 'a1');
    expect(s2.rows.size).toBe(1);
  });

  it('запрещённый корень отклоняется даже в расширении', async () => {
    const s = setup({ extraRoots: 'op' });
    const t = dto({ template: 'op {username}' }) as never;
    expect(await status(s.service.upsert('p1', t, 'a1'))).toBe(400);
  });

  it('setRoots: запрещённый корень 400 без 2FA; успех пишет и аудирует', async () => {
    const s = setup();
    expect(
      await status(
        s.service.setRoots({ roots: ['op'], twoFactorCode: '123456' }, 'a1'),
      ),
    ).toBe(400);
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    const out = await s.service.setRoots(
      { roots: ['Unban', 'unban', 'mute-off'], twoFactorCode: '123456' },
      'a1',
    );
    expect(out.extra).toEqual(['unban', 'mute-off']);
    expect(s.audit.logInTx).toHaveBeenCalled();
  });

  it('без кода 2FA: 403, запись не идёт', async () => {
    const s = setup();
    expect(
      await status(
        s.service.upsert('p1', dto({ twoFactorCode: ' ' }) as never, 'a1'),
      ),
    ).toBe(403);
    expect(s.rows.size).toBe(0);
  });

  it('неверный код: 403, счётчик растёт, запись не идёт', async () => {
    const s = setup({ twoFactor: null });
    expect(await status(s.service.upsert('p1', dto() as never, 'a1'))).toBe(
      403,
    );
    expect(s.redis.client.eval).toHaveBeenCalledTimes(1);
    expect(s.rows.size).toBe(0);
    expect(s.audit.logInTx).not.toHaveBeenCalled();
  });

  it('резервный код не принимается (allowBackup=false и метод не totp)', async () => {
    const s = setup({ twoFactor: 'backup' });
    expect(await status(s.service.upsert('p1', dto() as never, 'a1'))).toBe(
      403,
    );
    expect(s.twoFactor.verify).toHaveBeenCalledWith('a1', '123456', {
      allowBackup: false,
    });
    expect(s.rows.size).toBe(0);
  });

  it('защита от перебора: после 5 ошибок 429 без проверки кода', async () => {
    const s = setup({ fails: 5 });
    expect(await status(s.service.upsert('p1', dto() as never, 'a1'))).toBe(
      429,
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
  });

  it('счётчик растёт ДО проверки кода (INCR перед verify), один раз на попытку', async () => {
    const s = setup({ twoFactor: null });
    const order: string[] = [];
    s.redis.client.eval.mockImplementationOnce(async () => {
      order.push('incr');
      return 1;
    });
    s.twoFactor.verify.mockImplementationOnce(async () => {
      order.push('verify');
      return null;
    });
    await status(s.service.upsert('p1', dto() as never, 'a1'));
    expect(order).toEqual(['incr', 'verify']);
    expect(s.redis.client.eval).toHaveBeenCalledTimes(1);
  });

  it('шестая попытка: 429 даже при верном коде, verify не вызывается', async () => {
    const s = setup({ fails: 5 });
    expect(await status(s.service.upsert('p1', dto() as never, 'a1'))).toBe(
      429,
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(s.rows.size).toBe(0);
  });

  it('верный код сбрасывает счётчик', async () => {
    const s = setup({ fails: 2 });
    await s.service.upsert('p1', dto() as never, 'a1');
    expect(s.redis.client.del).toHaveBeenCalled();
  });

  it('неизвестный товар и вариант: 404', async () => {
    const s = setup();
    expect(await status(s.service.upsert('zzz', dto() as never, 'a1'))).toBe(
      404,
    );
    expect(
      await status(
        s.service.upsert('p1', dto({ variantId: 'zzz' }) as never, 'a1'),
      ),
    ).toBe(404);
    expect(s.rows.size).toBe(0);
  });

  it('сбой аудита пробрасывается (транзакция откатывается)', async () => {
    const s = setup();
    s.audit.logInTx.mockRejectedValueOnce(new Error('audit down'));
    await expect(s.service.upsert('p1', dto() as never, 'a1')).rejects.toThrow(
      'audit down',
    );
  });

  describe('preview', () => {
    it('возвращает команду и ничего не пишет', async () => {
      const s = setup();
      const out = await s.service.preview({
        template: 'lp user {username} parent addtemp ares {duration}',
        username: 'Steve',
        duration: 'WEEK_1',
      } as never);
      expect(out.command).toBe('lp user Steve parent addtemp ares 7d');
      expect(s.audit.logInTx).not.toHaveBeenCalled();
      expect(s.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('негодный ник и шаблон: 400', async () => {
      const s = setup();
      const run = async (over: Record<string, unknown>) => {
        try {
          await s.service.preview({
            template: 'give {username}',
            username: 'Steve',
            duration: 'WEEK_1',
            ...over,
          } as never);
          return 'ok';
        } catch (e) {
          return (e as HttpException).getStatus();
        }
      };
      expect(await run({ username: 'a;b' })).toBe(400);
      expect(await run({ username: 'x'.repeat(40) })).toBe(400);
      expect(await run({ template: 'give {username} | x' })).toBe(400);
    });
  });
});

describe('права контроллеров 0.11', () => {
  const perms = (cls: object, method: string) =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      (cls as { prototype: Record<string, unknown> }).prototype[
        method
      ] as object,
    );

  it.each(['list', 'preview', 'upsert'])(
    'шаблоны: %s только по store.delivery.templates.manage',
    (m) => {
      expect(perms(DeliveryTemplatesAdminController, m)).toEqual([
        'store.delivery.templates.manage',
      ]);
    },
  );

  it.each(['get', 'update'])(
    'настройки: %s только по store.settings.manage',
    (m) => {
      expect(perms(StoreSettingsAdminController, m)).toEqual([
        'store.settings.manage',
      ]);
    },
  );

  it('публичные тексты без прав', () => {
    expect(perms(StoreTextsController, 'texts')).toBeUndefined();
  });
});

describe('StoreSettingsService (0.11)', () => {
  function settingsSetup(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const tx = {
      siteSetting: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key)
            ? { key: where.key, value: store.get(where.key)! }
            : null,
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { key: string };
            create: { value: string };
          }) => {
            store.set(where.key, create.value);
          },
        ),
      },
    };
    const prisma = {
      siteSetting: {
        findMany: jest.fn(
          async ({ where }: { where: { key: { in: string[] } } }) =>
            where.key.in
              .filter((k) => store.has(k))
              .map((k) => ({ key: k, value: store.get(k)! })),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
    const service = new StoreSettingsService(prisma as never, audit as never);
    return { service, audit, store, tx };
  }

  it('сохраняет текст и пишет аудит со старым и новым значением', async () => {
    const s = settingsSetup({ 'store.text.refund_policy': 'старое' });
    const out = await s.service.update(
      { 'store.text.refund_policy': '  новое  ' },
      'a1',
    );
    expect(out['store.text.refund_policy']).toBe('новое');
    const entry = s.audit.logInTx.mock.calls[0][1];
    expect(entry.action).toBe('store.settings.updated');
    expect(entry.changes).toEqual({
      key: 'store.text.refund_policy',
      before: 'старое',
      after: 'новое',
    });
  });

  it('без изменений аудит не пишется', async () => {
    const s = settingsSetup({ 'store.text.shop_intro': 'a' });
    await s.service.update({ 'store.text.shop_intro': 'a' }, 'a1');
    expect(s.audit.logInTx).not.toHaveBeenCalled();
  });

  it('чужой ключ (в том числе служебный флаг доставки) отклоняется', async () => {
    const s = settingsSetup();
    await expect(
      s.service.update({ 'store.delivery.enabled': 'true' }, 'a1'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.service.update({ __proto__x: 'a', constructor: 'b' }, 'a1'),
    ).rejects.toMatchObject({ status: 400 });
    expect(s.store.size).toBe(0);
  });

  it('слишком длинный текст, не строка и управляющие символы: 400', async () => {
    const s = settingsSetup();
    await expect(
      s.service.update({ 'store.text.shop_intro': 'a'.repeat(2001) }, 'a1'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.service.update({ 'store.text.shop_intro': 5 }, 'a1'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.service.update({ 'store.text.shop_intro': 'a\u0000b' }, 'a1'),
    ).rejects.toMatchObject({ status: 400 });
    expect(s.store.size).toBe(0);
  });

  it('переводы строк в тексте допустимы', async () => {
    const s = settingsSetup();
    const out = await s.service.update(
      { 'store.text.unban_rules': 'п.1\nп.2' },
      'a1',
    );
    expect(out['store.text.unban_rules']).toBe('п.1\nп.2');
  });

  it('getTexts: отсутствующие тексты пустые', async () => {
    const s = settingsSetup();
    const out = await s.service.getTexts();
    expect(Object.values(out).every((v) => v === '')).toBe(true);
    expect(Object.keys(out)).toHaveLength(6);
  });
});
