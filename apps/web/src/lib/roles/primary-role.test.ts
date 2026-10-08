import { ROLE_PREFIXES } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { hasPermission } from '../auth/permissions';
import { getRolePrefixAsset, pickPrimaryRole } from './primary-role';

const owner = { slug: 'owner', priority: 1000, displayName: 'Owner' };
const developer = { slug: 'developer', priority: 300, displayName: 'Developer' };
const projectTeam = { slug: 'project-team', priority: 200, displayName: 'Project Team' };
const vip = { slug: 'vip', priority: 50, displayName: 'VIP', color: '#F26A1B' };
const player = { slug: 'player', priority: 0, displayName: 'Игрок' };

describe('getRolePrefixAsset', () => {
  it('сопоставляет slug роли с PNG на CDN и реальными размерами', () => {
    const asset = getRolePrefixAsset('chief-curator');
    expect(asset).not.toBeNull();
    expect(asset?.url).toBe(
      'https://cdn-files.twomc.su/minecraft/resourspack/prefixes/chief-curator.png',
    );
    expect(asset?.width).toBe(89);
    expect(asset?.name).toBe('Chief Curator');
  });

  it('все 29 ролей реестра имеют уникальный slug и ширину > 0', () => {
    expect(ROLE_PREFIXES).toHaveLength(29);
    expect(new Set(ROLE_PREFIXES.map((p) => p.slug)).size).toBe(29);
    for (const prefix of ROLE_PREFIXES) {
      expect(getRolePrefixAsset(prefix.slug)?.width).toBeGreaterThan(0);
    }
  });

  it('неизвестная роль, пустой и null → null (fallback на текст)', () => {
    expect(getRolePrefixAsset('vip')).toBeNull();
    expect(getRolePrefixAsset('')).toBeNull();
    expect(getRolePrefixAsset(null)).toBeNull();
    expect(getRolePrefixAsset(undefined)).toBeNull();
  });

  it('префикс не зависит от permissions: доступ решает только RBAC', () => {
    const effective = { superuser: false, permissions: [], maxPriority: null };
    expect(getRolePrefixAsset('owner')).not.toBeNull();
    expect(hasPermission(effective, 'users.ban')).toBe(false);
  });
});

describe('pickPrimaryRole', () => {
  it('выбирает самую старшую роль с префиксом, порядок входа не важен', () => {
    expect(pickPrimaryRole([projectTeam, vip, developer])?.slug).toBe('developer');
    expect(pickPrimaryRole([developer, owner, projectTeam])?.slug).toBe('owner');
  });

  it('VIP выше по priority, но без префикса → показываем старшую роль с префиксом', () => {
    const vipAbove = { ...vip, priority: 400 };
    expect(pickPrimaryRole([vipAbove, developer])?.slug).toBe('developer');
  });

  it('если ни у одной роли нет префикса — самая старшая роль', () => {
    expect(pickPrimaryRole([player, vip])?.slug).toBe('vip');
  });

  it('без ролей → null; входной массив не мутируется', () => {
    expect(pickPrimaryRole([])).toBeNull();
    const roles = [projectTeam, owner];
    pickPrimaryRole(roles);
    expect(roles[0].slug).toBe('project-team');
  });
});
