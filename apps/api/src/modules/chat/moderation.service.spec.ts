import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { ModerationService } from './moderation.service';

const DENY = 'Недостаточно прав для действия над этим пользователем';

function build(canAct: (actor: string, target: string) => boolean) {
  const prisma = {
    chatMute: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    chatBan: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
  };
  const permissions = {
    canActOn: jest.fn((a: string, t: string) => Promise.resolve(canAct(a, t))),
  };
  const service = new ModerationService(
    prisma as unknown as PrismaService,
    permissions as unknown as PermissionService,
  );
  return { service, prisma, permissions };
}

// Приоритеты: moderator=10, player=0, admin=100, owner=1000; SYSTEM — всегда false.
const priority: Record<string, number> = {
  mod: 10,
  player: 0,
  admin: 100,
  owner: 1000,
  peer: 10,
};
const rule = (a: string, t: string) =>
  t !== 'system' && (priority[a] ?? 0) > (priority[t] ?? 0);

describe('ModerationService: иерархия mute/ban', () => {
  const dtoMute = (userId: string) => ({ userId, reason: 'SPAM' }) as never;
  const dtoBan = (userId: string) => ({ userId, reason: 'x' }) as never;

  it.each(['admin', 'owner', 'system', 'mod', 'peer'])(
    'mute: модератор -> %s = отказ',
    async (target) => {
      const { service, prisma } = build(rule);
      await expect(service.muteUser('mod', dtoMute(target))).rejects.toThrow(
        new ForbiddenException(DENY),
      );
      expect(prisma.chatMute.create).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'owner', 'system', 'mod', 'peer'])(
    'ban: модератор -> %s = отказ',
    async (target) => {
      const { service, prisma } = build(rule);
      await expect(service.banUser('mod', dtoBan(target))).rejects.toThrow(
        new ForbiddenException(DENY),
      );
      expect(prisma.chatBan.create).not.toHaveBeenCalled();
    },
  );

  it('самозащита не зависит от canActOn', async () => {
    const { service, prisma } = build(() => true);
    await expect(service.muteUser('mod', dtoMute('mod'))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.banUser('mod', dtoBan('mod'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.chatMute.create).not.toHaveBeenCalled();
    expect(prisma.chatBan.create).not.toHaveBeenCalled();
  });

  it('несуществующая цель (canActOn=false) = отказ для mute и ban', async () => {
    const { service, prisma } = build(() => false);
    await expect(
      service.muteUser('mod', dtoMute('missing-user')),
    ).rejects.toThrow(new ForbiddenException(DENY));
    await expect(
      service.banUser('mod', dtoBan('missing-user')),
    ).rejects.toThrow(new ForbiddenException(DENY));
    expect(prisma.chatMute.create).not.toHaveBeenCalled();
    expect(prisma.chatBan.create).not.toHaveBeenCalled();
  });

  it('mute: модератор -> обычный игрок = успех', async () => {
    const { service, prisma } = build(rule);
    await service.muteUser('mod', dtoMute('player'));
    expect(prisma.chatMute.create).toHaveBeenCalledTimes(1);
  });

  it('ban: модератор -> обычный игрок = успех', async () => {
    const { service, prisma } = build(rule);
    await service.banUser('mod', dtoBan('player'));
    expect(prisma.chatBan.create).toHaveBeenCalledTimes(1);
  });
});

describe('ModerationService: снятие mute/ban (Q25)', () => {
  // Неизвестный выдавший (null / не найден): порог = 1000 (владелец).
  const prio: Record<string, number> = {
    mod: 10,
    peer: 10,
    junior: 5,
    admin: 100,
    owner: 1000,
  };
  const UNKNOWN_THRESHOLD = 1000;
  const NOT_ALLOWED = 'Недостаточно прав для снятия этого ограничения';

  function buildRevoke(issuer: string | null, target = 'player') {
    const prisma = {
      chatMute: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(
            args.where.id === 'm1'
              ? { id: 'm1', userId: target, mutedBy: issuer }
              : null,
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      chatBan: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(
            args.where.id === 'b1'
              ? { id: 'b1', userId: target, bannedBy: issuer }
              : null,
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const permissions = {
      canRevokeSanction: jest.fn((actor: string, by: string | null) => {
        if (by === actor) {
          return Promise.resolve(true);
        }
        const need = by && by in prio ? prio[by] : UNKNOWN_THRESHOLD;
        return Promise.resolve((prio[actor] ?? 0) >= need);
      }),
    };
    const service = new ModerationService(
      prisma as unknown as PrismaService,
      permissions as unknown as PermissionService,
    );
    return { service, prisma, permissions };
  }

  const cases = [
    ['mute', 'unmute', 'm1', 'chatMute'],
    ['ban', 'unban', 'b1', 'chatBan'],
  ] as const;

  describe.each(cases)('%s', (_kind, method, id, model) => {
    const run = (s: ModerationService, actor: string) =>
      method === 'unmute' ? s.unmute(actor, id) : s.unban(actor, id);

    it('выдавший снимает (даже если приоритет ниже)', async () => {
      const { service, prisma } = buildRevoke('junior');
      await run(service, 'junior');
      expect(prisma[model].update).toHaveBeenCalledWith({
        where: { id },
        data: { isActive: false },
      });
    });

    it('равный по приоритету снимает', async () => {
      const { service, prisma } = buildRevoke('mod');
      await run(service, 'peer');
      expect(prisma[model].update).toHaveBeenCalledTimes(1);
    });

    it('старший снимает', async () => {
      const { service, prisma } = buildRevoke('mod');
      await run(service, 'admin');
      expect(prisma[model].update).toHaveBeenCalledTimes(1);
    });

    it('младший получает 403 с общим текстом', async () => {
      const { service, prisma } = buildRevoke('mod');
      await expect(run(service, 'junior')).rejects.toThrow(
        new ForbiddenException(NOT_ALLOWED),
      );
      expect(prisma[model].update).not.toHaveBeenCalled();
    });

    it('неизвестный выдавший (null): снимает только достаточно старший', async () => {
      const { service, prisma } = buildRevoke(null);
      await expect(run(service, 'admin')).rejects.toThrow(ForbiddenException);
      await run(service, 'owner');
      expect(prisma[model].update).toHaveBeenCalledTimes(1);
    });

    it('неизвестный выдавший (id не найден): младший 403', async () => {
      const { service } = buildRevoke('ghost');
      await expect(run(service, 'mod')).rejects.toThrow(ForbiddenException);
    });

    it('снять с себя может только выдавший', async () => {
      const { service, prisma } = buildRevoke('mod', 'admin');
      await expect(run(service, 'admin')).rejects.toThrow(ForbiddenException);
      expect(prisma[model].update).not.toHaveBeenCalled();
      const own = buildRevoke('admin', 'admin');
      await run(own.service, 'admin');
      expect(own.prisma[model].update).toHaveBeenCalledTimes(1);
    });

    it('несуществующий id: NotFound, права не проверяются', async () => {
      const { service, permissions } = buildRevoke('mod');
      await expect(
        method === 'unmute'
          ? service.unmute('mod', 'nope')
          : service.unban('mod', 'nope'),
      ).rejects.toThrow(NotFoundException);
      expect(permissions.canRevokeSanction).not.toHaveBeenCalled();
    });
  });
});
