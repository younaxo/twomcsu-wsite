import type { EffectivePermissions } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { checkPermissions, hasPermission, requirementKeys } from './permissions';

const staff: EffectivePermissions = {
  superuser: false,
  permissions: ['users.view', 'roles.view'],
  maxPriority: 50,
};
const owner: EffectivePermissions = { superuser: true, permissions: [], maxPriority: 1000 };

describe('permissions helpers', () => {
  it('hasPermission: superuser проходит любую проверку, обычный — только явные ключи', () => {
    expect(hasPermission(staff, 'users.view')).toBe(true);
    expect(hasPermission(staff, 'users.ban')).toBe(false);
    expect(hasPermission(owner, 'users.ban')).toBe(true);
    expect(hasPermission(null, 'users.view')).toBe(false);
    expect(hasPermission(undefined, 'users.view')).toBe(false);
  });

  it('checkPermissions: массив — любой из ключей (раздел виден при одном *.view)', () => {
    expect(checkPermissions(staff, ['users.ban', 'roles.view'])).toBe(true);
    expect(checkPermissions(staff, ['users.ban', 'users.delete'])).toBe(false);
    expect(checkPermissions(staff, [])).toBe(false);
  });

  it('checkPermissions: anyOf/allOf комбинируются', () => {
    expect(checkPermissions(staff, { allOf: ['users.view', 'roles.view'] })).toBe(true);
    expect(checkPermissions(staff, { allOf: ['users.view', 'users.ban'] })).toBe(false);
    expect(
      checkPermissions(staff, { anyOf: ['users.ban', 'users.view'], allOf: ['roles.view'] }),
    ).toBe(true);
    expect(checkPermissions(staff, { anyOf: ['users.ban'], allOf: ['roles.view'] })).toBe(false);
    expect(checkPermissions(staff, {})).toBe(true);
    expect(checkPermissions(null, {})).toBe(false);
  });

  it('requirementKeys: плоский уникальный список для сообщения «не хватает прав»', () => {
    expect(requirementKeys('users.view')).toEqual(['users.view']);
    expect(requirementKeys(['users.view', 'roles.view'])).toEqual(['users.view', 'roles.view']);
    expect(requirementKeys({ anyOf: ['users.view'], allOf: ['users.view', 'roles.view'] })).toEqual(
      ['users.view', 'roles.view'],
    );
  });
});
