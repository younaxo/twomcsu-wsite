import { readFileSync } from 'fs';
import { join } from 'path';
import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import {
  MinecraftPunishmentsAdminController,
  MinecraftPunishmentsMeController,
  MinecraftPunishmentsPublicController,
} from './punishments.controllers';

/// Тест-план п.22, 30, 31: каталог прав и защита маршрутов. Каталог читается
/// как текст (apps/api не импортирует @twomc/shared), БД не нужна.
const REPO_ROOT = join(__dirname, '../../../../..');
const CATALOG = readFileSync(
  join(REPO_ROOT, 'packages/shared/src/permissions.ts'),
  'utf8',
);

describe('каталог прав (N1, п.30, 31)', () => {
  it('punishments.issuer.hide встречается один раз, с модулем и описанием', () => {
    const occurrences = CATALOG.match(/'punishments\.issuer\.hide'/g) ?? [];
    expect(occurrences).toHaveLength(1);
    const block = /key: 'punishments\.issuer\.hide',([\s\S]*?)\},/.exec(
      CATALOG,
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/module: 'punishments'/);
    expect(block![1]).toMatch(/description:\s*'[^']{5,}'/);
  });

  it('отдельного punishments.view нет', () => {
    expect(CATALOG).not.toMatch(/'punishments\.view'/);
  });

  it('seed делает upsert каждого ключа каталога', () => {
    const seed = readFileSync(
      join(__dirname, '../../../prisma/seed/index.ts'),
      'utf8',
    );
    expect(seed).toMatch(/PERMISSIONS/);
    expect(seed).toMatch(/permission\.upsert/);
  });
});

describe('маршруты (п.8, 22, 30)', () => {
  const keysOf = (proto: object, method: string): string[] | undefined =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      (proto as Record<string, object>)[method],
    ) as string[] | undefined;

  it('публичный контроллер без JwtAuthGuard и без прав', () => {
    const guards = (Reflect.getMetadata(
      '__guards__',
      MinecraftPunishmentsPublicController,
    ) ?? []) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual([
      'PunishmentsPublicEnabledGuard',
    ]);
    const proto = MinecraftPunishmentsPublicController.prototype;
    expect(keysOf(proto, 'list')).toBeUndefined();
    expect(keysOf(proto, 'card')).toBeUndefined();
  });

  it('me требует вход (JwtAuthGuard) на методе', () => {
    const guards = (Reflect.getMetadata(
      '__guards__',
      MinecraftPunishmentsMeController.prototype.list,
    ) ?? []) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual(['JwtAuthGuard']);
  });

  it('admin: JwtAuthGuard + PermissionsGuard, права на каждом методе', () => {
    const guards = (Reflect.getMetadata(
      '__guards__',
      MinecraftPunishmentsAdminController,
    ) ?? []) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual([
      'JwtAuthGuard',
      'PermissionsGuard',
    ]);
    const proto = MinecraftPunishmentsAdminController.prototype;
    for (const m of ['list', 'status', 'card']) {
      expect(keysOf(proto, m)).toEqual(['users.punishments']);
    }
    for (const m of ['hideIssuer', 'unhideIssuer']) {
      expect(keysOf(proto, m)).toEqual(['punishments.issuer.hide']);
    }
  });

  it('маршрут status объявлен раньше :ref, issuer-hidden не пересекается с ними', () => {
    const proto = MinecraftPunishmentsAdminController.prototype;
    const path = (m: string): string =>
      Reflect.getMetadata(
        'path',
        (proto as unknown as Record<string, object>)[m],
      ) as string;
    expect(path('status')).toBe('status');
    expect(path('card')).toBe(':ref');
    expect(path('hideIssuer')).toBe(':ref/issuer-hidden');
    expect(path('unhideIssuer')).toBe(':ref/issuer-hidden');
    const order = Object.getOwnPropertyNames(proto);
    expect(order.indexOf('status')).toBeLessThan(order.indexOf('card'));
  });
});
