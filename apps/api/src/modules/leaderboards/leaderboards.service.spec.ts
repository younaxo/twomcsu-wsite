import { LeaderboardsService } from './leaderboards.service';

function build(enabled: boolean) {
  const prisma = {
    playerStatistics: {
      findMany: jest.fn().mockResolvedValue([
        {
          kills: 5,
          playTime: 90,
          coins: 3,
          user: { id: 'u1', username: 'Steve', avatar: null },
        },
      ]),
    },
    userAchievement: { groupBy: jest.fn().mockResolvedValue([]) },
    order: { groupBy: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const storage = { publicUrl: jest.fn((v: string | null) => v) };
  const settings = { isPublicEnabled: jest.fn().mockResolvedValue(enabled) };
  const service = new LeaderboardsService(
    prisma as never,
    storage as never,
    settings as never,
  );
  return { service, prisma, settings };
}

describe('LeaderboardsService', () => {
  it('раздел выключен (по умолчанию): пустые таблицы, к данным игроков не обращается', async () => {
    const { service, prisma } = build(false);
    expect(await service.list()).toEqual({
      enabled: false,
      playtime: [],
      kills: [],
      coins: [],
      achievements: [],
    });
    expect(prisma.playerStatistics.findMany).not.toHaveBeenCalled();
    expect(prisma.userAchievement.groupBy).not.toHaveBeenCalled();
  });

  it('«Покупки» (Q66) не отдаются и не запрашиваются', async () => {
    const { service, prisma } = build(true);
    const result = await service.list();
    expect(Object.keys(result).sort()).toEqual([
      'achievements',
      'coins',
      'enabled',
      'kills',
      'playtime',
    ]);
    expect(result).not.toHaveProperty('purchases');
    expect(prisma.order.groupBy).not.toHaveBeenCalled();
  });

  it('в выборку попадают только открытые профили без скрытой статистики', async () => {
    const { service, prisma } = build(true);
    await service.list();
    const where = prisma.playerStatistics.findMany.mock.calls[0][0].where;
    expect(where.user).toMatchObject({
      isBanned: false,
      profileVisibility: 'EVERYONE',
      hideStatistics: false,
    });
    const achievementsWhere =
      prisma.userAchievement.groupBy.mock.calls[0][0].where;
    expect(achievementsWhere.user).toMatchObject({
      profileVisibility: 'EVERYONE',
      hideStatistics: false,
    });
  });

  it('второй запрос идёт из кэша, invalidate() заставляет пересчитать', async () => {
    const { service, prisma } = build(true);
    await service.list();
    await service.list();
    // 3 выборки PlayerStatistics (playtime, kills, coins) — один раз.
    expect(prisma.playerStatistics.findMany).toHaveBeenCalledTimes(3);
    service.invalidate();
    await service.list();
    expect(prisma.playerStatistics.findMany).toHaveBeenCalledTimes(6);
  });

  it('флаг проверяется на каждый запрос: выключение действует сразу, несмотря на кэш', async () => {
    const { service, settings } = build(true);
    await service.list();
    settings.isPublicEnabled.mockResolvedValue(false);
    const result = await service.list();
    expect(result.enabled).toBe(false);
    expect(result.kills).toEqual([]);
  });
});
