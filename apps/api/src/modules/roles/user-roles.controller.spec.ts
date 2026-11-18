import { ForbiddenException } from '@nestjs/common';
import { UserRolesController } from './user-roles.controller';

describe('UserRolesController.assign (Q23)', () => {
  const actor = { id: 'actor' } as never;
  const role = {
    id: 'role-1',
    priority: 10,
    isAssignable: true,
    isSuperuser: false,
  };

  function build(opts: {
    superuser?: boolean;
    exceed?: boolean;
    targetType?: string;
  }) {
    const prisma = {
      role: { findUnique: jest.fn().mockResolvedValue(role) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'target', accountType: opts.targetType }),
      },
      userRole: { upsert: jest.fn().mockReturnValue('upsert') },
      roleAssignmentLog: { create: jest.fn().mockReturnValue('log') },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const permissions = {
      getEffectivePermissions: jest.fn().mockResolvedValue({
        superuser: opts.superuser ?? false,
        permissions: [],
        maxPriority: 100,
      }),
      canActOn: jest.fn().mockResolvedValue(true),
      assertGrantorCoversRole: opts.exceed
        ? jest.fn().mockRejectedValue(
            new ForbiddenException({
              code: 'role_permissions_exceed_grantor',
              message: 'x',
            }),
          )
        : jest.fn().mockResolvedValue(undefined),
      invalidateUser: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new UserRolesController(
      prisma as never,
      permissions as never,
    );
    return { controller, prisma, permissions };
  }

  it('подмножество: роль выдана', async () => {
    const { controller, prisma, permissions } = build({});
    await expect(
      controller.assign(actor, 'target', 'role-1', {} as never),
    ).resolves.toEqual({ success: true });
    expect(permissions.assertGrantorCoversRole).toHaveBeenCalledWith(
      'actor',
      role,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('надмножество: 403 и запись не выполняется', async () => {
    const { controller, prisma } = build({ exceed: true });
    await expect(
      controller.assign(actor, 'target', 'role-1', {} as never),
    ).rejects.toMatchObject({
      response: { code: 'role_permissions_exceed_grantor' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('владелец: проверка подмножества не вызывается, роль выдана', async () => {
    const { controller, permissions, prisma } = build({ superuser: true });
    await expect(
      controller.assign(actor, 'target', 'role-1', {} as never),
    ).resolves.toEqual({ success: true });
    expect(permissions.assertGrantorCoversRole).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('приоритет сохранён: priority роли >= своего — 403 до проверки прав', async () => {
    const { controller, prisma, permissions } = build({});
    prisma.role.findUnique.mockResolvedValue({ ...role, priority: 100 });
    await expect(
      controller.assign(actor, 'target', 'role-1', {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.assertGrantorCoversRole).not.toHaveBeenCalled();
  });
});
