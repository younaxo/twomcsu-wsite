import type { EffectivePermissions } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { checkPermissions } from '../auth/permissions';
import {
  ADMIN_ENTRY_REQUIREMENT,
  ADMIN_NAV,
  findNavItem,
  isNavItemActive,
  resolveNavItem,
} from './navigation';

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

  it('подразделы (ADR-0139): пункт активен на любой странице, ведёт на первый доступный', () => {
    expect(findNavItem('/admin/awards')?.href).toBe('/admin/achievements');
    expect(findNavItem('/admin/achievements')?.label).toBe('Достижения и награды');
    const item = findNavItem('/admin/awards')!;

    const awardsOnly = effective(['awards.view']);
    expect(checkPermissions(awardsOnly, item.requirement)).toBe(true);
    expect(checkPermissions(awardsOnly, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
    const resolved = resolveNavItem(item, (r) => checkPermissions(awardsOnly, r));
    expect(resolved.href).toBe('/admin/awards');
    expect(resolved.sections?.map((s) => s.label)).toEqual(['Награды']);
    expect(isNavItemActive(resolved, '/admin/awards')).toBe(true);

    const both = effective(['achievements.view', 'awards.view']);
    const full = resolveNavItem(item, (r) => checkPermissions(both, r));
    expect(full.href).toBe('/admin/achievements');
    expect(full.sections).toHaveLength(2);
  });

  it('«Команда» и «Роли и права» — пункты с подразделами (ADR-0140)', () => {
    expect(findNavItem('/admin/departments')?.label).toBe('Команда');
    expect(findNavItem('/admin/custom-positions')?.label).toBe('Команда');
    expect(findNavItem('/admin/permissions')?.label).toBe('Роли и права');
    const team = findNavItem('/admin/positions')!;
    const deptOnly = effective(['departments.view']);
    expect(checkPermissions(deptOnly, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
    const resolved = resolveNavItem(team, (r) => checkPermissions(deptOnly, r));
    expect(resolved.href).toBe('/admin/departments');
    expect(resolved.sections?.map((s) => s.label)).toEqual(['Отделы']);
  });

  it('медиа-заявки — подраздел «Пользователей» (ADR-0141)', () => {
    expect(findNavItem('/admin/media-requests')?.label).toBe('Пользователи');
    const users = findNavItem('/admin/users')!;
    const mediaOnly = effective(['media_requests.view']);
    expect(checkPermissions(mediaOnly, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
    expect(resolveNavItem(users, (r) => checkPermissions(mediaOnly, r)).href).toBe(
      '/admin/media-requests',
    );
  });

  it('новости — подраздел «Контента» (ADR-0143)', () => {
    expect(findNavItem('/admin/news/abc')?.label).toBe('Контент');
    const content = findNavItem('/admin/content')!;
    const newsOnly = effective(['news.view']);
    expect(checkPermissions(newsOnly, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
    expect(resolveNavItem(content, (r) => checkPermissions(newsOnly, r)).href).toBe('/admin/news');
  });

  it('темы и голосование — подразделы «Контента» (ADR-0144, ADR-0145)', () => {
    expect(findNavItem('/admin/topics/abc')?.label).toBe('Контент');
    expect(findNavItem('/admin/voting')?.label).toBe('Контент');
    expect(findNavItem('/admin/events')?.label).toBe('Контент');
    const content = findNavItem('/admin/content')!;
    const topicsOnly = effective(['topics.view']);
    expect(checkPermissions(topicsOnly, ADMIN_ENTRY_REQUIREMENT)).toBe(true);
    expect(resolveNavItem(content, (r) => checkPermissions(topicsOnly, r)).href).toBe(
      '/admin/topics',
    );
  });
});
