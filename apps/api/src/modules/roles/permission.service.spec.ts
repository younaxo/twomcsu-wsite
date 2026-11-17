import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';

type RoleRow = {
  isSuperuser: boolean;
  priority: number;
  permissions: { effect: 'ALLOW' | 'DENY'; permission: { key: string } }[];
};

function allow(...keys: string[]): RoleRow['permissions'] {
  return keys.map((key) => ({ effect: 'ALLOW', permission: { key } }));
}

function build(grantorRoles: RoleRow[], grantedRolePermissions: string[]) {
  const prisma = {
    userRole: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          grantorRoles.map((role, i) => ({ roleId: `r${i}`, role })),
        ),
    },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue(
        grantedRolePermissions.map((key) => ({
          effect: 'ALLOW',
          permission: { key },
        })),
      ),
    },
  };
  const redis = {
    client: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      sadd: jest.fn().mockResolvedValue(1),
    },
  };
  const service = new PermissionService(prisma as never, redis as never);
  return { service, prisma };
}

describe('PermissionService.assertGrantorCoversRole (Q23)', () => {
  const grantedRole = { id: 'role-x', isSuperuser: false };

  it('права роли — подмножество прав выдающего: разрешено', async () => {
    const { service } = build(
      [
        {
          isSuperuser: false,
          priority: 100,
          permissions: allow('roles.assign', 'users.view', 'news.edit'),
        },
      ],
      ['users.view', 'news.edit'],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', grantedRole),
    ).resolves.toBeUndefined();
  });

  it('роль без прав: разрешено', async () => {
    const { service } = build(
      [{ isSuperuser: false, priority: 100, permissions: allow('a.b') }],
      [],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', grantedRole),
    ).resolves.toBeUndefined();
  });

  it('права роли шире прав выдающего: 403 role_permissions_exceed_grantor', async () => {
    const { service } = build(
      [{ isSuperuser: false, priority: 100, permissions: allow('users.view') }],
      ['users.view', 'users.ban', 'roles.delete'],
    );
    const error = await service
      .assertGrantorCoversRole('grantor', grantedRole)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'role_permissions_exceed_grantor',
      missing: ['roles.delete', 'users.ban'],
    });
  });

  it('владелец (superuser) может выдать любую роль', async () => {
    const { service, prisma } = build(
      [{ isSuperuser: true, priority: 1000, permissions: [] }],
      ['anything.at.all'],
    );
    await expect(
      service.assertGrantorCoversRole('owner', {
        id: 'role-y',
        isSuperuser: true,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('роль с полным доступом (isSuperuser) не-владелец выдать не может', async () => {
    const { service } = build(
      [{ isSuperuser: false, priority: 500, permissions: allow('*') }],
      [],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', {
        id: 'role-owner',
        isSuperuser: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'role_permissions_exceed_grantor' },
    });
  });

  it('wildcard у выдающего покрывает любые права роли', async () => {
    const { service } = build(
      [{ isSuperuser: false, priority: 500, permissions: allow('*') }],
      ['users.ban', 'roles.delete'],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', grantedRole),
    ).resolves.toBeUndefined();
  });

  it('wildcard в роли без wildcard у выдающего: 403', async () => {
    const { service } = build(
      [{ isSuperuser: false, priority: 100, permissions: allow('users.view') }],
      ['*'],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', grantedRole),
    ).rejects.toMatchObject({
      response: { code: 'role_permissions_exceed_grantor', missing: ['*'] },
    });
  });

  it('права объединяются по всем ролям выдающего', async () => {
    const { service } = build(
      [
        { isSuperuser: false, priority: 100, permissions: allow('a.one') },
        { isSuperuser: false, priority: 50, permissions: allow('b.two') },
      ],
      ['a.one', 'b.two'],
    );
    await expect(
      service.assertGrantorCoversRole('grantor', grantedRole),
    ).resolves.toBeUndefined();
  });
});
