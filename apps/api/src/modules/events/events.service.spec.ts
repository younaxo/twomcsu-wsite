import { CalendarEventVisibility } from '@prisma/client';
import { EventsService } from './events.service';

const KEY = 'k'.repeat(32);

function setup(env: { key?: string; nodeEnv?: string }) {
  const hasPermission = jest.fn().mockResolvedValue(true);
  const config = {
    get: (name: string, def?: string) =>
      name === 'TWO_FACTOR_ENCRYPTION_KEY'
        ? (env.key ?? def)
        : name === 'NODE_ENV'
          ? env.nodeEnv
          : def,
  };
  const prisma = {
    calendarEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new EventsService(
    prisma as never,
    { hasPermission } as never,
    config as never,
  );
  return { service, prisma, hasPermission };
}

function visibilityIn(prisma: ReturnType<typeof setup>['prisma']) {
  const call = prisma.calendarEvent.findMany.mock.calls[0][0] as {
    where: { visibility: { in: CalendarEventVisibility[] } };
  };
  return call.where.visibility.in;
}

describe('EventsService.list и 2FA персонала (Q22, ADR-0169)', () => {
  it('ключ задан, персонал без 2FA: STAFF-события не добавляются', async () => {
    const { service, prisma, hasPermission } = setup({ key: KEY });
    await service.list({} as never, { id: 'u1', twoFactorEnabled: false });
    expect(visibilityIn(prisma)).toEqual(['PUBLIC', 'AUTHENTICATED']);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('ключ задан, персонал с 2FA: STAFF-события добавляются', async () => {
    const { service, prisma, hasPermission } = setup({ key: KEY });
    await service.list({} as never, { id: 'u1', twoFactorEnabled: true });
    expect(visibilityIn(prisma)).toEqual(['PUBLIC', 'AUTHENTICATED', 'STAFF']);
    expect(hasPermission).toHaveBeenCalledWith('u1', 'events.view.staff');
  });

  it('без ключа в явном development: как раньше', async () => {
    const { service, prisma } = setup({ nodeEnv: 'development' });
    await service.list({} as never, { id: 'u1' });
    expect(visibilityIn(prisma)).toContain('STAFF');
  });

  it('аноним: только PUBLIC', async () => {
    const { service, prisma } = setup({ key: KEY });
    await service.list({} as never, null);
    expect(visibilityIn(prisma)).toEqual(['PUBLIC']);
  });
});

describe('EventsService.mine (ADR-0169)', () => {
  it('без фильтра видимости: только свои события (созданные или с участием)', async () => {
    const { service, prisma } = setup({ key: KEY });
    await service.mine('u1');
    const call = prisma.calendarEvent.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty('visibility');
    expect(call.where).toEqual({
      OR: [{ createdById: 'u1' }, { participants: { some: { userId: 'u1' } } }],
    });
  });

  it('не проверяет право персонала: STAFF-события пользователя отдаются как есть', async () => {
    const { service, prisma, hasPermission } = setup({ key: KEY });
    const own = [{ id: 'e1', visibility: 'STAFF', createdById: 'u1' }];
    prisma.calendarEvent.findMany.mockResolvedValue(own);
    expect(await service.mine('u1')).toEqual(own);
    expect(hasPermission).not.toHaveBeenCalled();
  });
});

describe('EventsService: без ключа 2FA вне dev/test — fail closed (Q22)', () => {
  // NODE_ENV подаётся через мок ConfigService, process.env не затрагивается.
  it.each(['', undefined, 'staging'])(
    'NODE_ENV=%p без ключа: персонал без флага 2FA не получает staff-видимость',
    async (nodeEnv) => {
      const { service, prisma } = setup({ nodeEnv });
      await service.list({} as never, { id: 'u1' });
      expect(visibilityIn(prisma)).not.toContain('STAFF');
    },
  );
});
