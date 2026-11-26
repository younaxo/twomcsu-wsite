import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { CommentsService } from '../comments/comments.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
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
  canActOn?: boolean;
  updateCount?: number;
}) {
  const tx = {
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    },
    userPunishment: { create: jest.fn().mockResolvedValue('punishment') },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.user),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const permissions = {
    canActOn: jest.fn().mockResolvedValue(opts.canActOn ?? true),
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
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTx: jest.fn().mockResolvedValue(undefined),
  };
  const leaderboards = { invalidate: jest.fn() };
  const auth = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
  const service = new QuickModerationService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    {} as ChatService,
    {} as CommentsService,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
    leaderboards as unknown as LeaderboardsService,
  );
  return { service, prisma, tx, permissions, audit, auth, leaderboards };
}

describe('QuickModerationService.ban: «кто выдал», иерархия, гонки (Q48)', () => {
  it('сохраняет bannedById = выдавшего условным переводом isBanned false -> true', async () => {
    const { service, tx } = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
    });
    await service.ban('u1', 'mod', { reason: 'cheat' } as never);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', isBanned: false },
      data: expect.objectContaining({ isBanned: true, bannedById: 'mod' }),
    });
    expect(tx.userPunishment.create).toHaveBeenCalledTimes(1);
  });

  it('выдача бана старшему/равному: 403, ничего не пишется', async () => {
    const { service, prisma } = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
      canActOn: false,
    });
    await expect(
      service.ban('u1', 'junior', { reason: 'x' } as never),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('гонка: параллельный бан выиграл -> 409, наказание не создаётся', async () => {
    const { service, tx } = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
      updateCount: 0,
    });
    await expect(
      service.ban('u1', 'mod', { reason: 'x' } as never),
    ).rejects.toThrow(ConflictException);
    expect(tx.userPunishment.create).not.toHaveBeenCalled();
  });
});

describe('QuickModerationService.unban (Q48, Q49, ADR-0173)', () => {
  it('разрешено: условно очищает бан и bannedById, аудит в той же транзакции', async () => {
    const { service, tx, permissions, audit } = build({
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
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', isBanned: true, bannedById: 'mod' },
      data: {
        isBanned: false,
        banReason: null,
        bannedUntil: null,
        bannedById: null,
      },
    });
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'mod',
        action: 'user.unban',
        targetId: 'u1',
        changes: { issuerId: 'mod', ownerOverride: false, self: false },
      }),
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('старый бан без выдавшего: правилу null, условие bannedById null, в аудите «нет записи»', async () => {
    const { service, tx, permissions, audit } = build({
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
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1', isBanned: true, bannedById: null },
      }),
    );
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTx).not.toHaveBeenCalled();
  });

  it('гонка: бан перевыдан за время проверки -> 409, аудита нет', async () => {
    const { service, audit } = build({
      user: { id: 'u1', isBanned: true, bannedById: 'mod' },
      updateCount: 0,
    });
    await expect(service.unban('u1', 'mod')).rejects.toThrow(ConflictException);
    expect(audit.logInTx).not.toHaveBeenCalled();
  });

  it('ошибка аудита пробрасывается из транзакции (снятие откатывается)', async () => {
    const { service, audit } = build({
      user: { id: 'u1', isBanned: true, bannedById: 'mod' },
    });
    audit.logInTx.mockRejectedValueOnce(new Error('db down'));
    await expect(service.unban('u1', 'mod')).rejects.toThrow('db down');
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
    expect(audit.logInTx).toHaveBeenCalledWith(
      expect.anything(),
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

describe('QuickModerationService: сброс кэша рейтингов (ADR-0195)', () => {
  it('бан сбрасывает кэш рейтингов после транзакции', async () => {
    const { service, leaderboards } = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
    });
    await service.ban('u1', 'mod', { reason: 'cheat' } as never);
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });

  it('разбан сбрасывает кэш рейтингов', async () => {
    const { service, leaderboards } = build({
      user: { id: 'u1', isBanned: true, bannedById: 'mod' },
    });
    await service.unban('u1', 'mod');
    expect(leaderboards.invalidate).toHaveBeenCalledTimes(1);
  });

  it('неудачный бан (гонка 409) и отказ в разбане кэш не трогают', async () => {
    const lost = build({
      user: { id: 'u1', isBanned: false, bannedById: null },
      updateCount: 0,
    });
    await expect(
      lost.service.ban('u1', 'mod', { reason: 'x' } as never),
    ).rejects.toThrow(ConflictException);
    expect(lost.leaderboards.invalidate).not.toHaveBeenCalled();
    const denied = build({
      user: { id: 'u1', isBanned: true, bannedById: 'mod' },
      updateCount: 0,
    });
    await expect(denied.service.unban('u1', 'mod')).rejects.toThrow(
      ConflictException,
    );
    expect(denied.leaderboards.invalidate).not.toHaveBeenCalled();
  });
});
