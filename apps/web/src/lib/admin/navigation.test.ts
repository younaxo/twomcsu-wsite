import type { EffectivePermissions } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { checkPermissions } from '../auth/permissions';
import { ADMIN_ENTRY_REQUIREMENT, ADMIN_NAV, findNavItem, isNavItemActive } from './navigation';

const effective = (permissions: string[]): EffectivePermissions => ({
  superuser: false,
  permissions,
  maxPriority: 10,
});

describe('admin navigation', () => {
  it('superuser видит все пункты', () => {
    const su: EffectivePermissions = { superuser: true, permissions: [], maxPriority: 1000 };
    const visible = ADMIN_NAV.flatMap((g) => g.items).filter((i) =>
      checkPermissions(su, i.requirement),
    );
    expect(visible).toHaveLength(ADMIN_NAV.flatMap((g) => g.items).length);
  });

  it('без прав — ни одного пункта и нет входа в админку', () => {
    const none = effective([]);
    const visible = ADMIN_NAV.flatMap((g) => g.items).filter((i) =>
      checkPermissions(none, i.requirement),
    );
    expect(visible).toHaveLength(0);
    expect(checkPermissions(none, ADMIN_ENTRY_REQUIREMENT)).toBe(false);
  });

  it('одного *.view достаточно для группы и входа', () => {
    const viewer = effective(['users.view']);
    const visible = ADMIN_NAV.flatMap((g) => g.items).filter((i) =>
      checkPermissions(viewer, i.requirement),
    );
    expect(visible.map((i) => i.href)).toEqual(['/admin/users']);
    expect(checkPermissions(viewer, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
  });

  it('активность: /admin только точное совпадение, разделы — по префиксу', () => {
    const dashboard = findNavItem('/admin');
    expect(dashboard?.href).toBe('/admin');
    expect(findNavItem('/admin/users/abc')?.href).toBe('/admin/users');
    expect(isNavItemActive(dashboard!, '/admin/users')).toBe(false);
  });
});
