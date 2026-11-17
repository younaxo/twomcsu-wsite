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

describe('PermissionService.canRevokeSanction (Q25, Q48, Q49)', () => {
  function buildRevoke(opts: {
    byUser: Record<string, RoleRow[]>;
    users: Record<string, 'USER' | 'SYSTEM'>;
    topPriority: number | null;
  }) {
    const prisma = {
      userRole: {
        findMany: jest.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            (opts.byUser[where.userId] ?? []).map((role, i) => ({
              roleId: `${where.userId}-r${i}`,
              role,
            })),
          ),
        ),
      },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id in opts.users
              ? { id: where.id, accountType: opts.users[where.id] }
              : null,
          ),
        ),
      },
      role: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { priority: opts.topPriority } }),
      },
    };
    const redis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        sadd: jest.fn().mockResolvedValue(1),
      },
    };
    return new PermissionService(prisma as never, redis as never);
  }
  const role = (priority: number, isSuperuser = false): RoleRow => ({
    isSuperuser,
    priority,
    permissions: [],
  });
  const base = {
    byUser: {
      mod: [role(10)],
      peer: [role(10)],
      junior: [role(5)],
      admin: [role(100)],
      owner: [role(1000, true)],
    },
    users: {
      mod: 'USER',
      peer: 'USER',
      junior: 'USER',
      admin: 'USER',
      owner: 'USER',
      sys: 'SYSTEM',
    } as Record<string, 'USER' | 'SYSTEM'>,
    topPriority: 1000,
  };

  it('выдавший снимает свой, даже с меньшим приоритетом', async () => {
    const s = buildRevoke(base);
    await expect(s.canRevokeSanction('junior', 'junior')).resolves.toBe(true);
    await expect(s.canRevokeSanction('junior', 'junior', 'peer')).resolves.toBe(
      true,
    );
  });

  it('равный и старший могут, младший нет', async () => {
    const s = buildRevoke(base);
    await expect(s.canRevokeSanction('peer', 'mod', 'x')).resolves.toBe(true);
    await expect(s.canRevokeSanction('admin', 'mod', 'x')).resolves.toBe(true);
    await expect(s.canRevokeSanction('junior', 'mod', 'x')).resolves.toBe(
      false,
    );
  });

  it('владелец снимает всегда: чужую, равную и без выдавшего', async () => {
    const s = buildRevoke(base);
    await expect(s.canRevokeSanction('owner', 'admin', 'x')).resolves.toBe(
      true,
    );
    const d = await s.evaluateSanctionRevoke('owner', 'admin', 'x');
    expect(d).toEqual({
      allowed: true,
      ownerOverride: true,
      self: false,
      issuerKnown: true,
    });
  });

  it('владелец снимает с себя чужую санкцию (Q49), ownerOverride и self', async () => {
    const s = buildRevoke(base);
    const d = await s.evaluateSanctionRevoke('owner', 'admin', 'owner');
    expect(d).toMatchObject({
      allowed: true,
      ownerOverride: true,
      self: true,
    });
  });

  it('владелец снимает свою же санкцию: без ownerOverride', async () => {
    const s = buildRevoke(base);
    const d = await s.evaluateSanctionRevoke('owner', 'owner', 'x');
    expect(d).toMatchObject({ allowed: true, ownerOverride: false });
  });

  it.each([null, undefined, '', 'deleted-user', 'sys'])(
    'неизвестный выдавший (%p): только владелец',
    async (issuer) => {
      const s = buildRevoke(base);
      await expect(s.canRevokeSanction('admin', issuer, 'x')).resolves.toBe(
        false,
      );
      await expect(s.canRevokeSanction('owner', issuer, 'x')).resolves.toBe(
        true,
      );
      const d = await s.evaluateSanctionRevoke('owner', issuer, 'x');
      expect(d.ownerOverride).toBe(true);
      expect(d.issuerKnown).toBe(Boolean(issuer));
    },
  );

  it('не-владелец не снимает с себя санкцию, выданную другим, даже старшему', async () => {
    const s = buildRevoke(base);
    await expect(s.canRevokeSanction('admin', 'mod', 'admin')).resolves.toBe(
      false,
    );
    await expect(s.canRevokeSanction('admin', null, 'admin')).resolves.toBe(
      false,
    );
    await expect(
      s.canRevokeSanction('junior', 'admin', 'junior'),
    ).resolves.toBe(false);
  });

  it('не-владелец с себя свою (самовыданную) санкцию снимает', async () => {
    const s = buildRevoke(base);
    await expect(s.canRevokeSanction('admin', 'admin', 'admin')).resolves.toBe(
      true,
    );
  });

  it('assertCanRevokeSanction: отказ -> 403 sanction_revoke_forbidden', async () => {
    const s = buildRevoke(base);
    await expect(
      s.assertCanRevokeSanction('junior', 'mod', 'x'),
    ).rejects.toMatchObject({
      response: { code: 'sanction_revoke_forbidden' },
    });
    await expect(
      s.assertCanRevokeSanction('admin', 'mod', 'x'),
    ).resolves.toMatchObject({ allowed: true, ownerOverride: false });
  });
});

describe('PermissionService: пользователь без ролей через кеш (L9, ревью Q25)', () => {
  /// Redis-заглушка с реальным round-trip: set сохраняет строку, get отдаёт её.
  /// Так maxPriority = -Infinity проходит JSON.stringify/parse, как в проде.
  function buildCached(opts: {
    byUser: Record<string, number[]>;
    users: Record<string, 'USER' | 'SYSTEM'>;
  }) {
    const store = new Map<string, string>();
    const prisma = {
      userRole: {
        findMany: jest.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(
            (opts.byUser[where.userId] ?? []).map((priority, i) => ({
              roleId: `${where.userId}-r${i}`,
              role: { isSuperuser: false, priority, permissions: [] },
            })),
          ),
        ),
      },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id in opts.users
              ? { id: where.id, accountType: opts.users[where.id] }
              : null,
          ),
        ),
      },
      role: {
        aggregate: jest.fn().mockResolvedValue({ _max: { priority: 0 } }),
      },
    };
    const redis = {
      client: {
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
          store.set(key, value);
          return Promise.resolve('OK');
        }),
        sadd: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new PermissionService(prisma as never, redis as never);
    return { service, store };
  }

  const users = {
    nobody: 'USER',
    other: 'USER',
    lowest: 'USER',
  } as Record<string, 'USER' | 'SYSTEM'>;

  it('кеш хранит maxPriority без ролей как -Infinity после чтения', async () => {
    const { service } = buildCached({ byUser: { nobody: [] }, users });
    await service.getEffectivePermissions('nobody'); // заполняет кеш
    const cached = await service.getEffectivePermissions('nobody');
    expect(cached.maxPriority).toBe(Number.NEGATIVE_INFINITY);
    await expect(service.getMaxPriority('nobody')).resolves.toBe(
      Number.NEGATIVE_INFINITY,
    );
  });

  it('canRevokeSanction: без ролей (из кеша) не снимает санкцию роли с приоритетом 0', async () => {
    const { service } = buildCached({
      byUser: { nobody: [], lowest: [0] },
      users,
    });
    await service.getEffectivePermissions('nobody'); // заполняет кеш
    await expect(service.canRevokeSanction('nobody', 'lowest')).resolves.toBe(
      false,
    );
    // неизвестный выдавший: порог = максимум по ролям (0 в заглушке)
    await expect(service.canRevokeSanction('nobody', null)).resolves.toBe(
      false,
    );
  });

  it('canActOn: без ролей (из кеша) не имеет власти над пользователем без ролей', async () => {
    const { service } = buildCached({
      byUser: { nobody: [], other: [] },
      users,
    });
    await service.getEffectivePermissions('nobody'); // заполняет кеш
    await expect(service.canActOn('nobody', 'other')).resolves.toBe(false);
  });
});
