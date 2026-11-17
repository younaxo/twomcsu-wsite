import type { EffectivePermissions } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { checkPermissions } from '../auth/permissions';
import { ApiError } from '../api/errors';
import { ADMIN_NAV, findNavItem, resolveNavItem } from './navigation';
import { describeStoreAdminError, isAllowedProductImageUrl, priceToCents } from './store-products';

describe('isAllowedProductImageUrl (как в API и next.config)', () => {
  it('пропускает только https и белый список хостов', () => {
    expect(isAllowedProductImageUrl('https://cdn-files.twomc.su/a.png')).toBe(true);
    expect(isAllowedProductImageUrl('https://mc-heads.net/avatar/x')).toBe(true);
    expect(isAllowedProductImageUrl('https://minotar.net/helm/x')).toBe(true);
    expect(isAllowedProductImageUrl('http://cdn-files.twomc.su/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('https://evil.example/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('https://cdn-files.twomc.su.evil.com/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('https://cdn-files.twomc.su@evil.com/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('https://user:pw@cdn-files.twomc.su/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('https://cdn-files.twomc.su:8443/a.png')).toBe(false);
    expect(isAllowedProductImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedProductImageUrl('')).toBe(false);
  });
});

describe('priceToCents', () => {
  it('считает в целых без float', () => {
    expect(priceToCents('0.1')).toBe(10n);
    expect(priceToCents('199.50')).toBe(19950n);
    expect(priceToCents('199')).toBe(19900n);
    expect(priceToCents('12.345')).toBeNull();
    expect(priceToCents('-1')).toBeNull();
    expect(priceToCents('1e3')).toBeNull();
  });
});

describe('describeStoreAdminError', () => {
  it('2FA и 403 различаются', () => {
    const twoFa = describeStoreAdminError(new ApiError(403, ['x'], { code: 'admin_2fa_required' }));
    expect(twoFa.needsTwoFactor).toBe(true);
    const forbidden = describeStoreAdminError(new ApiError(403, ['x']));
    expect(forbidden.forbidden).toBe(true);
    expect(forbidden.needsTwoFactor).toBe(false);
  });

  it('коды 409/422 дают понятные сообщения', () => {
    expect(
      describeStoreAdminError(new ApiError(409, ['x'], { code: 'PRODUCT_IN_BUNDLE' })).message,
    ).toMatch(/входит в набор/);
    expect(
      describeStoreAdminError(new ApiError(409, ['x'], { code: 'VARIANT_IN_BUNDLE' })).message,
    ).toMatch(/Вариант входит в набор/);
    expect(
      describeStoreAdminError(new ApiError(422, ['x'], { code: 'PRODUCT_TYPE_NOT_SELLABLE' }))
        .fields.isActive,
    ).toMatch(/не входит в список/);
  });

  it('400 валидации раскладывается по полям', () => {
    const info = describeStoreAdminError(
      new ApiError(400, [
        'Картинка — https-ссылка на один из хостов: a',
        'slug может содержать только строчные латинские буквы, цифры и дефис',
        'property gameCommands should not exist',
      ]),
    );
    expect(info.fields.image).toBeTruthy();
    expect(info.fields.slug).toBeTruthy();
  });
});

describe('навигация: Магазин', () => {
  const effective = (permissions: string[]): EffectivePermissions => ({
    superuser: false,
    permissions,
    maxPriority: 10,
  });

  it('пункт виден по store.products.view или store.categories.view', () => {
    const item = findNavItem('/admin/store/products')!;
    expect(item.label).toBe('Товары магазина');
    expect(checkPermissions(effective(['store.categories.view']), item.requirement)).toBe(true);
    expect(checkPermissions(effective(['users.view']), item.requirement)).toBe(false);
    expect(ADMIN_NAV.some((g) => g.id === 'store')).toBe(true);
  });

  it('только категории — ссылка ведёт на категории', () => {
    const item = findNavItem('/admin/store/categories')!;
    const perms = effective(['store.categories.view']);
    const resolved = resolveNavItem(item, (r) => checkPermissions(perms, r));
    expect(resolved.href).toBe('/admin/store/categories');
    expect(resolved.sections).toHaveLength(1);
  });
});
