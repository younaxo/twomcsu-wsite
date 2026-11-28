import { NotFoundException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { AdminPlayersController } from './admin-players.controller';
import { AdminPlayersService } from './admin-players.service';

function setup(opts: { user?: boolean; stats?: object | null } = {}) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.user === false ? null : { id: 'u1' }),
    },
    playerStatistics: {
      findUnique: jest.fn().mockResolvedValue(opts.stats ?? null),
    },
  };
  const inventory = {
    getForAdmin: jest.fn().mockResolvedValue({
      state: 'no_data',
      servers: [],
      viewer: { relation: 'admin' },
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminPlayersService(
    prisma as never,
    inventory as never,
    audit as never,
  );
  return { service, prisma, inventory, audit };
}

describe('AdminPlayersService (Q116)', () => {
  it('inventory: 404 для несуществующего пользователя, без аудита', async () => {
    const { service, audit, inventory } = setup({ user: false });
    await expect(service.getInventory('a1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.log).not.toHaveBeenCalled();
    expect(inventory.getForAdmin).not.toHaveBeenCalled();
  });

  it('inventory: пустое состояние и аудит без содержимого', async () => {
    const { service, audit } = setup();
    const res = await service.getInventory('a1', 'u1', 'survival');
    expect(res.state).toBe('no_data');
    expect(audit.log).toHaveBeenCalledWith({
      actorId: 'a1',
      action: 'players.inventory.view',
      targetType: 'user',
      targetId: 'u1',
      strict: true,
    });
  });

  it('stats: нет записи - no_data; есть - поля без приватных', async () => {
    const empty = await setup().service.getStats('a1', 'u1');
    expect(empty).toEqual({
      state: 'no_data',
      stats: null,
      viewer: { relation: 'admin' },
    });
    const updatedAt = new Date('2026-11-01T00:00:00Z');
    const { service, audit } = setup({
      stats: {
        id: 'x',
        userId: 'u1',
        coins: 5,
        playTime: 90,
        kills: 3,
        deaths: 1,
        hits: 7,
        killDeathRatio: 3,
        lastServer: 'survival',
        updatedAt,
      },
    });
    const res = await service.getStats('a1', 'u1');
    expect(res.state).toBe('ok');
    expect(Object.keys(res.stats ?? {}).sort()).toEqual([
      'deaths',
      'hits',
      'killDeathRatio',
      'kills',
      'lastServer',
      'playTimeMinutes',
      'updatedAt',
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'players.stats.view', targetId: 'u1' }),
    );
  });

  it('аудит: ipAddress и userAgent (усечён до 255) в обеих записях', async () => {
    const meta = { ipAddress: '203.0.113.7', userAgent: 'x'.repeat(400) };
    const a = setup();
    await a.service.getInventory('a1', 'u1', undefined, meta);
    expect(a.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'players.inventory.view',
        ipAddress: '203.0.113.7',
        userAgent: 'x'.repeat(255),
      }),
    );
    const b = setup();
    await b.service.getStats('a1', 'u1', meta);
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'players.stats.view',
        ipAddress: '203.0.113.7',
        userAgent: 'x'.repeat(255),
      }),
    );
  });

  it('контроллер: ip нормализуется, userAgent усекается', async () => {
    const service = {
      getInventory: jest.fn().mockResolvedValue({}),
      getStats: jest.fn().mockResolvedValue({}),
    };
    const ctrl = new AdminPlayersController(service as never);
    const req = {
      ip: '::ffff:203.0.113.9',
      socket: {},
      get: () => 'u'.repeat(300),
    };
    const res = { setHeader: jest.fn() };
    await ctrl.stats({ id: 'a1' } as never, 'u1', res as never, req as never);
    expect(service.getStats).toHaveBeenCalledWith('a1', 'u1', {
      ipAddress: '203.0.113.9',
      userAgent: 'u'.repeat(255),
    });
    await ctrl.inventory(
      { id: 'a1' } as never,
      'u1',
      { server: 's' } as never,
      res as never,
      req as never,
    );
    expect(service.getInventory).toHaveBeenCalledWith('a1', 'u1', 's', {
      ipAddress: '203.0.113.9',
      userAgent: 'u'.repeat(255),
    });
  });

  it('стат: 404 для несуществующего', async () => {
    await expect(
      setup({ user: false }).service.getStats('a1', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('оба маршрута требуют players.inventory.view', () => {
    for (const name of ['inventory', 'stats'] as const) {
      const keys = Reflect.getMetadata(
        PERMISSIONS_KEY,
        AdminPlayersController.prototype[name],
      );
      expect(keys).toEqual(['players.inventory.view']);
    }
  });
});
