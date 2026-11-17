import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InventoryEnabledGuard } from './inventory-enabled.guard';
import {
  InventoryController,
  etagFor,
  matchesIfNoneMatch,
} from './inventory.controller';
import type { InventoryPrivacyService } from './inventory-privacy.service';
import type { InventoryService } from './inventory.service';

const BODY = {
  state: 'no_data' as const,
  servers: [],
  viewer: { relation: 'owner' as const },
};

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: jest.fn(),
  };
  return { res: res as unknown as Response, headers, status: res.status };
}

function setup() {
  const inventory = { getMine: jest.fn().mockResolvedValue(BODY) };
  const privacy = {
    get: jest.fn().mockResolvedValue({ inventoryPublic: false, enderPublic: false }),
    update: jest.fn().mockResolvedValue({ inventoryPublic: true, enderPublic: false }),
  };
  const controller = new InventoryController(
    inventory as unknown as InventoryService,
    privacy as unknown as InventoryPrivacyService,
  );
  return { controller, inventory, privacy };
}

const user = { id: 'u1', email: 'e', username: 'TestPlayer001' };

describe('InventoryController', () => {
  it('защищён JwtAuthGuard, затем InventoryEnabledGuard (401 раньше 503)', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InventoryController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, InventoryEnabledGuard]);
  });

  it('GET /me: заголовки private, ETag, Vary', async () => {
    const { controller, inventory } = setup();
    const { res, headers } = makeRes();
    const body = await controller.getMine(
      user,
      { server: 'survival' },
      { headers: {} } as Request,
      res,
    );
    expect(body).toEqual(BODY);
    expect(inventory.getMine).toHaveBeenCalledWith('u1', 'survival');
    expect(headers['Cache-Control']).toBe('private, no-cache');
    expect(headers['Vary']).toBe('Cookie');
    expect(headers['ETag']).toBe(etagFor(BODY));
  });

  it('If-None-Match совпал — 304 без тела', async () => {
    const { controller } = setup();
    const { res, status } = makeRes();
    const body = await controller.getMine(
      user,
      {},
      { headers: { 'if-none-match': etagFor(BODY) } } as unknown as Request,
      res,
    );
    expect(body).toBeUndefined();
    expect(status).toHaveBeenCalledWith(304);
  });

  it('If-None-Match не совпал — 200 с телом', async () => {
    const { controller } = setup();
    const { res, status } = makeRes();
    const body = await controller.getMine(
      user,
      {},
      { headers: { 'if-none-match': '"other"' } } as unknown as Request,
      res,
    );
    expect(body).toEqual(BODY);
    expect(status).not.toHaveBeenCalled();
  });

  it('ошибка доступа/данных пробрасывается до сравнения ETag', async () => {
    const { controller, inventory } = setup();
    inventory.getMine.mockRejectedValue(new Error('404'));
    const { res, status } = makeRes();
    await expect(
      controller.getMine(
        user,
        {},
        { headers: { 'if-none-match': '*' } } as unknown as Request,
        res,
      ),
    ).rejects.toThrow('404');
    expect(status).not.toHaveBeenCalled();
  });

  it('GET и PATCH privacy берут userId только из сессии', async () => {
    const { controller, privacy } = setup();
    const { res, headers } = makeRes();
    await controller.getPrivacy(user, res);
    expect(privacy.get).toHaveBeenCalledWith('u1');
    expect(headers['Cache-Control']).toBe('private, no-cache');
    await controller.updatePrivacy(user, { inventoryPublic: true }, makeRes().res);
    expect(privacy.update).toHaveBeenCalledWith('u1', { inventoryPublic: true });
  });
});

describe('etag helpers', () => {
  it('ETag стабилен и зависит от содержимого, а не от порядка ключей', () => {
    expect(etagFor({ a: 1, b: 2 })).toBe(etagFor({ b: 2, a: 1 }));
    expect(etagFor({ a: 1 })).not.toBe(etagFor({ a: 2 }));
    expect(etagFor(BODY)).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it('If-None-Match: список, слабые теги, звёздочка', () => {
    const tag = etagFor(BODY);
    expect(matchesIfNoneMatch(tag, tag)).toBe(true);
    expect(matchesIfNoneMatch(`W/${tag}`, tag)).toBe(true);
    expect(matchesIfNoneMatch(`"x", ${tag}`, tag)).toBe(true);
    expect(matchesIfNoneMatch('*', tag)).toBe(true);
    expect(matchesIfNoneMatch('"x"', tag)).toBe(false);
    expect(matchesIfNoneMatch(undefined, tag)).toBe(false);
  });
});

describe('InventoryEnabledGuard (fail-closed)', () => {
  const guardWith = (value: unknown) =>
    new InventoryEnabledGuard({
      get: () => value,
    } as unknown as ConfigService);

  it.each([undefined, '', 'false', '0', 'no', 'yes', null])(
    'значение %j — 503 inventory_unavailable',
    (value) => {
      const guard = guardWith(value);
      expect(() => guard.canActivate()).toThrow(ServiceUnavailableException);
      try {
        guard.canActivate();
      } catch (error) {
        expect(
          (error as ServiceUnavailableException).getResponse(),
        ).toMatchObject({ code: 'inventory_unavailable' });
      }
    },
  );

  it.each(['true', 'TRUE', true])('значение %j — разрешено', (value) => {
    expect(guardWith(value).canActivate()).toBe(true);
  });
});
