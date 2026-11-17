import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PermissionService } from '../roles/permission.service';
import {
  ISSUER_HIDE_PERMISSION,
  PunishmentsIssuerHideService,
} from './punishments-issuer-hide.service';
import type { PunishmentsReadService } from './punishments-read.service';
import type { MirrorRow } from './punishments-view';

/// Тест-план п.24, 25, 32-35, 37: скрытие выдавшего на моках (без БД).
/// Откат транзакции проверяется контрактом вызова: UPDATE и аудит идут через
/// один `tx` внутри `$transaction`; реальный откат - этап C (e2e).
const GOOD_UUID = '223e4567-e89b-42d3-a456-426614174000';
const OFFLINE_UUID = '223e4567-e89b-32d3-a456-426614174000';

function row(over: Partial<MirrorRow> = {}): MirrorRow {
  return {
    id: 'cl1',
    source: 'litebans',
    sourceScope: 'default',
    kind: 'BAN',
    sourceId: BigInt(42),
    subjectUuid: '123e4567-e89b-42d3-a456-426614174000',
    subjectName: 'Steve',
    executorUuid: GOOD_UUID,
    executorName: 'ModOne',
    executorIsConsole: false,
    issuerHidden: false,
    issuerHiddenById: null,
    issuerHiddenAt: null,
    issuerHiddenReason: null,
    rev: 1,
    ...over,
  } as MirrorRow;
}

const CARD = { item: { ref: 'ban-42' }, meta: {} };

function make() {
  const tx = {
    minecraftPunishment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    minecraftAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    role: {
      aggregate: jest.fn().mockResolvedValue({ _max: { priority: 50 } }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'hider' }) },
  };
  const permissions = {
    isSuperuser: jest.fn().mockResolvedValue(false),
    canActOn: jest.fn().mockResolvedValue(false),
    getMaxPriority: jest.fn().mockResolvedValue(0),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const reader = {
    findByRef: jest.fn().mockResolvedValue(row()),
    staffCardOf: jest.fn().mockResolvedValue(CARD),
    invalidatePublicCache: jest.fn(),
  };
  const service = new PunishmentsIssuerHideService(
    prisma as unknown as PrismaService,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
    reader as unknown as PunishmentsReadService,
  );
  return { service, tx, prisma, permissions, audit, reader };
}

async function thrown(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('ожидалась ошибка');
}

function expectForbiddenHide(e: unknown): void {
  expect(e).toBeInstanceOf(ForbiddenException);
  expect((e as ForbiddenException).getResponse()).toMatchObject({
    statusCode: 403,
    code: 'punishments_issuer_hide_forbidden',
  });
}

describe('hide: успешный путь (п.24, 33)', () => {
  it('условный UPDATE, аудит в той же транзакции, сброс кэша после фиксации', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    const order: string[] = [];
    h.tx.minecraftPunishment.updateMany.mockImplementation(() => {
      order.push('update');
      return Promise.resolve({ count: 1 });
    });
    h.audit.logInTx.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    h.reader.invalidatePublicCache.mockImplementation(() => {
      order.push('invalidate');
    });

    const res = await h.service.hide('actor', 'ban-42', 'жалоба');
    expect(res).toBe(CARD);
    expect(order).toEqual(['update', 'audit', 'invalidate']);

    const update = h.tx.minecraftPunishment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'cl1', issuerHidden: false });
    expect(update.data).toMatchObject({
      issuerHidden: true,
      issuerHiddenById: 'actor',
      issuerHiddenReason: 'жалоба',
      rev: { increment: 1 },
    });
    expect(update.data.issuerHiddenAt).toBeInstanceOf(Date);
    expect(update.data.lastChangedAt).toBeInstanceOf(Date);

    expect(h.audit.logInTx).toHaveBeenCalledTimes(1);
    const [txArg, input] = h.audit.logInTx.mock.calls[0];
    expect(txArg).toBe(h.tx);
    expect(input).toMatchObject({
      actorId: 'actor',
      action: 'punishment.issuer.hide',
      targetType: 'MinecraftPunishment',
      targetId: 'cl1',
      severity: 'warning',
    });
    expect(input.changes).toMatchObject({ ref: 'ban-42', reason: 'жалоба' });
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('IP и текст причины источника в аудит не попадают', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.reader.findByRef.mockResolvedValue(
      row({ reason: 'секрет источника' } as Partial<MirrorRow>),
    );
    await h.service.hide('actor', 'ban-42', 'r');
    const input = h.audit.logInTx.mock.calls[0][1];
    expect(JSON.stringify(input)).not.toContain('секрет источника');
  });
});

describe('атомарность (п.33)', () => {
  it('сбой аудита - ошибка пробрасывается, кэш не сбрасывается, свежая карточка не читается', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.audit.logInTx.mockRejectedValue(new Error('audit down'));
    await expect(h.service.hide('actor', 'ban-42', 'r')).rejects.toThrow(
      'audit down',
    );
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
    expect(h.reader.staffCardOf).not.toHaveBeenCalled();
  });

  it('сбой аудита при DELETE - то же', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.reader.findByRef.mockResolvedValue(
      row({ issuerHidden: true, issuerHiddenById: 'hider' }),
    );
    h.audit.logInTx.mockRejectedValue(new Error('audit down'));
    await expect(h.service.unhide('actor', 'ban-42')).rejects.toThrow(
      'audit down',
    );
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
  });

  it('сбой самой транзакции - кэш не сбрасывается', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.prisma.$transaction.mockRejectedValue(new Error('commit failed'));
    await expect(h.service.hide('actor', 'ban-42', 'r')).rejects.toThrow(
      'commit failed',
    );
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
  });
});

describe('идемпотентность (п.34)', () => {
  it('повторный POST при скрытом - без записи, аудита и сброса кэша', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.reader.findByRef.mockResolvedValue(
      row({ issuerHidden: true, issuerHiddenById: 'hider' }),
    );
    const res = await h.service.hide('actor', 'ban-42', 'r');
    expect(res).toBe(CARD);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.audit.logInTx).not.toHaveBeenCalled();
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
  });

  it('повторный DELETE при не скрытом - то же', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    const res = await h.service.unhide('actor', 'ban-42');
    expect(res).toBe(CARD);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('параллельный POST: UPDATE затронул 0 строк - повтор видит скрытие и не пишет аудит', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.tx.minecraftPunishment.updateMany.mockResolvedValue({ count: 0 });
    h.reader.findByRef
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(
        row({ issuerHidden: true, issuerHiddenById: 'other' }),
      );
    const res = await h.service.hide('actor', 'ban-42', 'r');
    expect(res).toBe(CARD);
    expect(h.audit.logInTx).not.toHaveBeenCalled();
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('два неудачных UPDATE подряд - не более двух попыток, ответ по последнему состоянию', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.tx.minecraftPunishment.updateMany.mockResolvedValue({ count: 0 });
    await h.service.hide('actor', 'ban-42', 'r');
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(h.audit.logInTx).not.toHaveBeenCalled();
    expect(h.reader.staffCardOf).toHaveBeenCalledTimes(1);
  });
});

describe('гонки POST/DELETE (п.35)', () => {
  it('DELETE повторно проверяет иерархию: вышестоящий скрыл между чтениями', async () => {
    const h = make();
    h.permissions.getMaxPriority.mockImplementation((id: string) =>
      Promise.resolve(id === 'actor' ? 10 : 90),
    );
    h.permissions.isSuperuser.mockResolvedValue(false);
    h.prisma.minecraftAccount.findUnique.mockResolvedValue(null);
    // Первое чтение: скрыто мной (разрешено снять); при записи 0 строк;
    // второе чтение: скрыто вышестоящим.
    h.reader.findByRef
      .mockResolvedValueOnce(
        row({ issuerHidden: true, issuerHiddenById: 'actor' }),
      )
      .mockResolvedValueOnce(
        row({ issuerHidden: true, issuerHiddenById: 'boss' }),
      );
    h.prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
    );
    h.tx.minecraftPunishment.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.role.aggregate.mockResolvedValue({ _max: { priority: 5 } });

    const e = await thrown(h.service.unhide('actor', 'ban-42'));
    expectForbiddenHide(e);
    expect(h.tx.minecraftPunishment.updateMany).toHaveBeenCalledTimes(1);
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('DELETE: условие UPDATE привязано к тому, кто скрыл', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    h.reader.findByRef.mockResolvedValue(
      row({ issuerHidden: true, issuerHiddenById: 'hider' }),
    );
    await h.service.unhide('actor', 'ban-42');
    const update = h.tx.minecraftPunishment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: 'cl1',
      issuerHidden: true,
      issuerHiddenById: 'hider',
    });
    expect(update.data).toMatchObject({
      issuerHidden: false,
      issuerHiddenById: null,
      issuerHiddenAt: null,
      issuerHiddenReason: null,
      rev: { increment: 1 },
    });
    expect(h.audit.logInTx.mock.calls[0][1]).toMatchObject({
      action: 'punishment.issuer.unhide',
    });
    expect(h.reader.invalidatePublicCache).toHaveBeenCalledTimes(1);
  });
});

describe('ref и существование (п.25)', () => {
  it.each(['junk', 'ban-0', 'ban-01', 'ban-99999999999999999999', ''])(
    'ref %j - 404 punishments_not_found без обращения к БД',
    async (ref) => {
      const h = make();
      const e = await thrown(h.service.hide('actor', ref, 'r'));
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).getResponse()).toMatchObject({
        code: 'punishments_not_found',
      });
      expect(h.reader.findByRef).not.toHaveBeenCalled();
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('несуществующая запись - 404', async () => {
    const h = make();
    h.reader.findByRef.mockResolvedValue(null);
    const e = await thrown(h.service.unhide('actor', 'ban-42'));
    expect(e).toBeInstanceOf(NotFoundException);
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });

  it('служебный ref допускает warn и kick', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    await h.service.hide('actor', 'warn-5', 'r');
    expect(h.reader.findByRef).toHaveBeenCalledWith('WARN', BigInt(5));
  });
});

describe('assertIssuerAccess: иерархия (п.25, 32)', () => {
  it('младший без сопоставления - 403 до любой записи', async () => {
    const h = make();
    h.permissions.getMaxPriority.mockResolvedValue(10);
    h.prisma.role.aggregate.mockResolvedValue({ _max: { priority: 50 } });
    const e = await thrown(h.service.hide('actor', 'ban-42', 'r'));
    expectForbiddenHide(e);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.audit.logInTx).not.toHaveBeenCalled();
    expect(h.reader.invalidatePublicCache).not.toHaveBeenCalled();
  });

  it('superuser - разрешено без дальнейших проверок', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    await expect(
      h.service.assertIssuerAccess('actor', row()),
    ).resolves.toBeUndefined();
    expect(h.prisma.minecraftAccount.findUnique).not.toHaveBeenCalled();
  });

  it('консоль - разрешено любому с правом', async () => {
    const h = make();
    await expect(
      h.service.assertIssuerAccess('actor', row({ executorIsConsole: true })),
    ).resolves.toBeUndefined();
    expect(h.prisma.minecraftAccount.findUnique).not.toHaveBeenCalled();
  });

  it('SYSTEM-выдавший - разрешено', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({
      userId: 'sys',
      user: { accountType: 'SYSTEM' },
    });
    await expect(
      h.service.assertIssuerAccess('actor', row()),
    ).resolves.toBeUndefined();
    expect(h.permissions.canActOn).not.toHaveBeenCalled();
  });

  it('сам выдавший - разрешено', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({
      userId: 'actor',
      user: { accountType: 'PLAYER' },
    });
    await expect(
      h.service.assertIssuerAccess('actor', row()),
    ).resolves.toBeUndefined();
  });

  it('сопоставленный выдавший: решает canActOn', async () => {
    const h = make();
    h.prisma.minecraftAccount.findUnique.mockResolvedValue({
      userId: 'other',
      user: { accountType: 'PLAYER' },
    });
    h.permissions.canActOn.mockResolvedValue(true);
    await expect(
      h.service.assertIssuerAccess('actor', row()),
    ).resolves.toBeUndefined();
    expect(h.permissions.canActOn).toHaveBeenCalledWith('actor', 'other');

    h.permissions.canActOn.mockResolvedValue(false);
    expectForbiddenHide(
      await thrown(h.service.assertIssuerAccess('actor', row())),
    );
    // Порог M для сопоставленного не применяется.
    expect(h.prisma.role.aggregate).not.toHaveBeenCalled();
  });

  it('сопоставление только по подтверждённой привязке (по uuid), не по нику', async () => {
    const h = make();
    await h.service.assertIssuerAccess('actor', row()).catch(() => undefined);
    expect(h.prisma.minecraftAccount.findUnique).toHaveBeenCalledWith({
      where: { uuid: GOOD_UUID },
      select: { userId: true, user: { select: { accountType: true } } },
    });
  });

  it('офлайн-uuid не сопоставляется: привязка не запрашивается, действует порог M', async () => {
    const h = make();
    h.permissions.getMaxPriority.mockResolvedValue(10);
    const e = await thrown(
      h.service.assertIssuerAccess(
        'actor',
        row({ executorUuid: OFFLINE_UUID }),
      ),
    );
    expectForbiddenHide(e);
    expect(h.prisma.minecraftAccount.findUnique).not.toHaveBeenCalled();
  });

  it('несопоставленный: приоритет не ниже M - разрешено; ниже - 403', async () => {
    const h = make();
    h.prisma.role.aggregate.mockResolvedValue({ _max: { priority: 50 } });
    h.permissions.getMaxPriority.mockResolvedValue(50);
    await expect(
      h.service.assertIssuerAccess('actor', row({ executorUuid: null })),
    ).resolves.toBeUndefined();
    h.permissions.getMaxPriority.mockResolvedValue(49);
    expectForbiddenHide(
      await thrown(
        h.service.assertIssuerAccess('actor', row({ executorUuid: null })),
      ),
    );
  });

  it('нет ролей с правом (M неизвестен) - 403', async () => {
    const h = make();
    h.prisma.role.aggregate.mockResolvedValue({ _max: { priority: null } });
    h.permissions.getMaxPriority.mockResolvedValue(1000);
    expectForbiddenHide(
      await thrown(
        h.service.assertIssuerAccess('actor', row({ executorUuid: null })),
      ),
    );
  });

  it('M считается по не-superuser ролям с правом скрытия или users.punishments', async () => {
    const h = make();
    await h.service.staffPriorityThreshold();
    const arg = h.prisma.role.aggregate.mock.calls[0][0];
    expect(arg._max).toEqual({ priority: true });
    expect(arg.where.isSuperuser).toBe(false);
    expect(arg.where.permissions.some.effect).toBe('ALLOW');
    expect(arg.where.permissions.some.permission.key.in.sort()).toEqual(
      [ISSUER_HIDE_PERMISSION, 'users.punishments'].sort(),
    );
  });
});

describe('assertCanUnhide (п.37)', () => {
  it('superuser снимает скрытие, поставленное любым, в том числе неизвестным', async () => {
    const h = make();
    h.permissions.isSuperuser.mockResolvedValue(true);
    await expect(h.service.assertCanUnhide('a', null)).resolves.toBeUndefined();
    await expect(
      h.service.assertCanUnhide('a', 'ghost'),
    ).resolves.toBeUndefined();
  });

  it('скрывший не найден (null или пользователь удалён) - только superuser', async () => {
    const h = make();
    expectForbiddenHide(await thrown(h.service.assertCanUnhide('a', null)));
    h.prisma.user.findUnique.mockResolvedValue(null);
    expectForbiddenHide(await thrown(h.service.assertCanUnhide('a', 'gone')));
  });

  it('сам скрывший снимает; не ниже приоритетом - можно; ниже - 403', async () => {
    const h = make();
    h.prisma.user.findUnique.mockResolvedValue({ id: 'hider' });
    await expect(
      h.service.assertCanUnhide('hider', 'hider'),
    ).resolves.toBeUndefined();

    h.permissions.getMaxPriority.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? 50 : 50),
    );
    await expect(
      h.service.assertCanUnhide('a', 'hider'),
    ).resolves.toBeUndefined();

    h.permissions.getMaxPriority.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? 40 : 50),
    );
    expectForbiddenHide(await thrown(h.service.assertCanUnhide('a', 'hider')));
  });

  it('DELETE младшего по приоритету - 403, состояние и аудит не меняются', async () => {
    const h = make();
    h.reader.findByRef.mockResolvedValue(
      row({
        issuerHidden: true,
        issuerHiddenById: 'hider',
        executorIsConsole: true,
      }),
    );
    h.permissions.getMaxPriority.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? 1 : 99),
    );
    expectForbiddenHide(await thrown(h.service.unhide('a', 'ban-42')));
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.audit.logInTx).not.toHaveBeenCalled();
  });
});
