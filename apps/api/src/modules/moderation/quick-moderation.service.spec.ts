import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { CommentsService } from '../comments/comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { QuickModerationService } from './quick-moderation.service';

type UserRow = {
  id: string;
  isBanned: boolean;
  bannedById: string | null;
};

function build(opts: {
  user: UserRow | null;
  decision?: {
    allowed: boolean;
    ownerOverride: boolean;
    self: boolean;
    issuerKnown: boolean;
  };
}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user),
      update: jest.fn().mockResolvedValue({}),
    },
    userPunishment: { create: jest.fn().mockReturnValue('punishment-op') },
    $transaction: jest.fn().mockResolvedValue(['punishment']),
  };
  const permissions = {
    assertCanRevokeSanction: jest.fn(() =>
      opts.decision && !opts.decision.allowed
        ? Promise.reject(
            new ForbiddenException({ code: 'sanction_revoke_forbidden' }),
          )
        : Promise.resolve(
            opts.decision ?? {
              allowed: true,
              ownerOverride: false,
              self: false,
              issuerKnown: true,
            },
          ),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const auth = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
  const service = new QuickModerationService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    {} as ChatService,
    {} as CommentsService,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
  );
  return { service, prisma, permissions, audit, auth };
}

describe('QuickModerationService.ban: запись «кто выдал» (Q48)', () => {
  it('сохраняет bannedById = выдавшего', async () => {
    const { service, prisma } = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
    });
    await service.ban('u1', 'mod', { reason: 'cheat' } as never);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ isBanned: true, bannedById: 'mod' }),
    });
  });
});

describe('QuickModerationService.unban (Q48, Q49, ADR-0173)', () => {
  it('разрешено: очищает бан и bannedById, пишет аудит', async () => {
    const { service, prisma, permissions, audit } = build({
      user: { id: 'u1', isBanned: true, bannedById: 'mod' },
    });
    await expect(service.unban('u1', 'mod')).resolves.toEqual({
      success: true,
    });
    expect(permissions.assertCanRevokeSanction).toHaveBeenCalledWith(
      'mod',
      'mod',
      'u1',
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        isBanned: false,
        banReason: null,
        bannedUntil: null,
        bannedById: null,
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mod',
        action: 'user.unban',
        targetId: 'u1',
        changes: { issuerId: 'mod', ownerOverride: false, self: false },
      }),
    );
  });

  it('старый бан без выдавшего: правилу передаётся null, в аудите «нет записи»', async () => {
    const { service, permissions, audit } = build({
      user: { id: 'u1', isBanned: true, bannedById: null },
      decision: {
        allowed: true,
        ownerOverride: true,
        self: false,
        issuerKnown: false,
      },
    });
    await service.unban('u1', 'owner');
    expect(permissions.assertCanRevokeSanction).toHaveBeenCalledWith(
      'owner',
      null,
      'u1',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          issuerId: 'нет записи',
          ownerOverride: true,
          self: false,
        },
      }),
    );
  });

  it('отказ правила: 403, бан не снят, аудита нет', async () => {
    const { service, prisma, audit } = build({
      user: { id: 'u1', isBanned: true, bannedById: 'admin' },
      decision: {
        allowed: false,
        ownerOverride: false,
        self: false,
        issuerKnown: true,
      },
    });
    await expect(service.unban('u1', 'junior')).rejects.toMatchObject({
      response: { code: 'sanction_revoke_forbidden' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('владелец снимает бан с себя: self=true в аудите', async () => {
    const { service, audit } = build({
      user: { id: 'owner', isBanned: true, bannedById: 'admin' },
      decision: {
        allowed: true,
        ownerOverride: true,
        self: true,
        issuerKnown: true,
      },
    });
    await service.unban('owner', 'owner');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { issuerId: 'admin', ownerOverride: true, self: true },
      }),
    );
  });

  it('не забанен: 403 до проверки правила; нет пользователя: 404', async () => {
    const a = build({ user: { id: 'u1', isBanned: false, bannedById: null } });
    await expect(a.service.unban('u1', 'mod')).rejects.toThrow(
      ForbiddenException,
    );
    expect(a.permissions.assertCanRevokeSanction).not.toHaveBeenCalled();
    const b = build({ user: null });
    await expect(b.service.unban('x', 'mod')).rejects.toThrow(
      NotFoundException,
    );
  });
});
