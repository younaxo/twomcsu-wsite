import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  InMemoryInventoryStore,
  item,
  iso,
  snapshot,
  T0,
  TEST_EPOCH,
  TEST_UUID,
} from '../../../test/support/in-memory-inventory';
import type { PrismaService } from '../prisma/prisma.service';
import { InventoryApplyService } from './inventory-apply.service';
import { InventoryService } from './inventory.service';

const USER = 'user-1';
const NOW = new Date(T0.getTime() + 60_000);

function setup(opts: { linked?: boolean; servers?: Array<{ slug: string; name: string }> } = {}) {
  const store = new InMemoryInventoryStore();
  store.link(TEST_UUID, USER);
  const prisma = {
    minecraftAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.linked === false ? null : { id: 'acc-1' }),
    },
    server: {
      findMany: jest.fn().mockResolvedValue(opts.servers ?? []),
    },
  };
  const service = new InventoryService(prisma as unknown as PrismaService, store);
  const apply = new InventoryApplyService(store);
  return { store, prisma, service, apply };
}

async function code(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse: () => unknown }).getResponse();
  }
  throw new Error('ожидалась ошибка');
}

describe('InventoryService.getMine', () => {
  it('нет привязки Minecraft — 404 not_found', async () => {
    const { service, prisma } = setup({ linked: false });
    const err = service.getMine(USER, undefined, NOW);
    await expect(err).rejects.toBeInstanceOf(NotFoundException);
    expect(await code(service.getMine(USER, undefined, NOW))).toMatchObject({
      code: 'not_found',
    });
    expect(prisma.server.findMany).not.toHaveBeenCalled();
  });

  it('привязка есть, снимков нет — state no_data и пустой список серверов', async () => {
    const { service } = setup();
    expect(await service.getMine(USER, undefined, NOW)).toEqual({
      state: 'no_data',
      servers: [],
      viewer: { relation: 'owner' },
    });
  });

  it('фильтр server без данных — сервер с группами no_data', async () => {
    const { service } = setup();
    const res = await service.getMine(USER, 'survival', NOW);
    expect(res.state).toBe('no_data');
    expect(res.servers).toHaveLength(1);
    expect(res.servers[0].server).toEqual({ slug: 'survival', name: 'survival' });
    expect(res.servers[0].groups.map((g) => [g.group, g.state])).toEqual([
      ['main', 'no_data'],
      ['ender', 'no_data'],
    ]);
    expect(res.servers[0].groups[0]).toMatchObject({
      capturedAt: null,
      playerOnline: null,
      slots: [],
    });
  });

  it.each(['Survival', 'a b', 'x'.repeat(33), 'a_b', '', '../x'])(
    'неверный server %j — 422 invalid_param',
    async (server) => {
      const { service } = setup();
      await expect(service.getMine(USER, server, NOW)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(await code(service.getMine(USER, server, NOW))).toMatchObject({
        code: 'invalid_param',
      });
    },
  );

  it('main с данными и ender без данных; название из Server', async () => {
    const { service, apply } = setup({
      servers: [{ slug: 'survival', name: 'Выживание' }],
    });
    await apply.applySnapshot(
      'survival',
      snapshot({
        slots: [
          {
            area: 'hotbar',
            slot: 0,
            item: item('minecraft:diamond_sword', {
              enchants: [{ id: 'minecraft:sharpness', level: 5 }],
              name: [{ text: 'Меч', color: '#F26A1B' }],
            }),
          },
        ],
      }),
      NOW,
    );
    const res = await service.getMine(USER, undefined, NOW);
    expect(res.state).toBe('ok');
    const [srv] = res.servers;
    expect(srv.server).toEqual({ slug: 'survival', name: 'Выживание' });
    const [main, ender] = srv.groups;
    expect(main).toMatchObject({
      group: 'main',
      state: 'ok',
      capturedAt: T0.toISOString(),
      playerOnline: true,
      isFresh: true,
    });
    expect(main.slots).toHaveLength(1);
    expect(main.slots[0].item).toMatchObject({
      id: 'minecraft:diamond_sword',
      count: 1,
      damage: null,
      enchants: [{ id: 'minecraft:sharpness', level: 5 }],
      name: [{ text: 'Меч', color: '#F26A1B' }],
      lore: [],
      loreTruncated: false,
      unbreakable: false,
      itemsAdderId: null,
    });
    expect(ender).toMatchObject({ group: 'ender', state: 'no_data', slots: [] });
  });

  it('несколько серверов, сортировка по slug, Ender виден владельцу', async () => {
    const { service, apply } = setup();
    await apply.applySnapshot('survival', snapshot(), NOW);
    await apply.applySnapshot('creative', snapshot(), NOW);
    await apply.applySnapshot(
      'creative',
      snapshot({
        group: 'ender',
        slots: [{ area: 'ender', slot: 3, item: item('minecraft:elytra') }],
      }),
      NOW,
    );
    const res = await service.getMine(USER, undefined, NOW);
    expect(res.servers.map((s) => s.server.slug)).toEqual([
      'creative',
      'survival',
    ]);
    const creative = res.servers[0];
    expect(creative.groups[1]).toMatchObject({ group: 'ender', state: 'ok' });
    expect(creative.groups[1].slots[0]).toMatchObject({ area: 'ender', slot: 3 });
    // Фильтр по серверу.
    const only = await service.getMine(USER, 'survival', NOW);
    expect(only.servers.map((s) => s.server.slug)).toEqual(['survival']);
  });

  it('isFresh: онлайн старше 15 минут — false; офлайн — всегда true', async () => {
    const { service, apply } = setup();
    await apply.applySnapshot('survival', snapshot(), NOW);
    await apply.applySnapshot(
      'creative',
      snapshot({ playerOnline: false }),
      NOW,
    );
    const later = new Date(T0.getTime() + 16 * 60_000);
    const res = await service.getMine(USER, undefined, later);
    const byServer = Object.fromEntries(
      res.servers.map((s) => [s.server.slug, s.groups[0]]),
    );
    expect(byServer.survival).toMatchObject({ playerOnline: true, isFresh: false });
    expect(byServer.creative).toMatchObject({ playerOnline: false, isFresh: true });
    const soon = await service.getMine(USER, undefined, new Date(T0.getTime() + 14 * 60_000));
    expect(soon.servers.find((s) => s.server.slug === 'survival')!.groups[0].isFresh).toBe(true);
  });

  it('ответ не содержит UUID, userId, epoch, rev, contentHash, lastSeenAt', async () => {
    const { service, apply } = setup();
    await apply.applySnapshot('survival', snapshot(), NOW);
    const res = await service.getMine(USER, undefined, NOW);
    const text = JSON.stringify(res);
    expect(text).not.toContain(TEST_UUID);
    expect(text).not.toContain(USER);
    expect(text).not.toContain(TEST_EPOCH);
    for (const key of ['uuid', 'userId', 'epoch', 'rev', 'contentHash', 'lastSeenAt', 'slotCount']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it('повторная очистка при выдаче: правила применяются к старым данным', async () => {
    const { service, store } = setup();
    // Строка «из прошлой версии правил»: § в тексте, невалидный слот.
    store.rows.set('user-1|survival|main', {
      userId: USER,
      serverSlug: 'survival',
      group: 'main',
      epoch: TEST_EPOCH,
      rev: 1,
      slots: [
        {
          area: 'hotbar',
          slot: 0,
          item: {
            id: 'minecraft:stone',
            count: 1,
            name: [{ text: `${String.fromCharCode(0xa7)}cКрасный`, evil: 'x' }],
          },
        },
        { area: 'hotbar', slot: 1, item: { id: 'BROKEN', count: 1 } },
      ],
      slotCount: 2,
      contentHash: 'x'.repeat(64),
      capturedAt: new Date(iso(0)),
      lastSeenAt: new Date(iso(0)),
      playerOnline: false,
    });
    const res = await service.getMine(USER, undefined, NOW);
    const slots = res.servers[0].groups[0].slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].item.name).toEqual([{ text: 'Красный' }]);
  });

  it('deleteForUser удаляет все ряды пользователя', async () => {
    const { service, store, apply } = setup();
    await apply.applySnapshot('survival', snapshot(), NOW);
    await apply.applySnapshot('creative', snapshot(), NOW);
    expect(await service.deleteForUser(USER)).toBe(2);
    expect(store.rows.size).toBe(0);
  });
});
