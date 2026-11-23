import { ProfilesService } from './profiles.service';

const stats = {
  playTime: 125,
  kills: 7,
  deaths: 2,
  killDeathRatio: 3.5,
  coins: 40,
};

function build(options: {
  enabled: boolean;
  hideStatistics?: boolean;
  profileVisibility?: string;
  statistics?: typeof stats | null;
}) {
  const user = {
    id: 'u1',
    shortId: 1,
    username: 'Steve',
    tag: 'T',
    discriminator: 1,
    avatar: null,
    banner: null,
    statusText: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    accountType: 'USER',
    selectedDecoration: null,
    badges: [],
    mediaBadges: [],
    isBanned: false,
    profileVisibility: options.profileVisibility ?? 'EVERYONE',
    hideStatistics: options.hideStatistics ?? false,
    lastActivityAt: null,
    isOnlineInGame: false,
    currentServer: null,
    position: null,
    roles: [],
    statistics: options.statistics === undefined ? stats : options.statistics,
  };
  // resolveUserIdByHandle и сама карточка читают пользователя через findFirst.
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(user) },
    friendship: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userAchievement: { count: jest.fn().mockResolvedValue(0) },
  };
  const storage = { publicUrl: (v: string | null) => v };
  const settings = {
    isPublicEnabled: jest.fn().mockResolvedValue(options.enabled),
  };
  const leaderboards = { invalidate: jest.fn() };
  const service = new ProfilesService(
    prisma as never,
    storage as never,
    settings as never,
    leaderboards as never,
  );
  return { service, leaderboards };
}

describe('ProfilesService.getProfileSummary: статистика', () => {
  it('раздел выключен: цифр нет, признака «скрыто» нет, statisticsEnabled=false', async () => {
    const { service } = build({ enabled: false });
    const res = await service.getProfileSummary('Steve', null);
    expect(res).toMatchObject({
      hidden: false,
      statistics: null,
      statisticsEnabled: false,
      statisticsHidden: false,
    });
  });

  it('раздел выключен: даже владелец не получает цифр', async () => {
    const { service } = build({ enabled: false });
    const res = await service.getProfileSummary('Steve', 'u1');
    expect(res).toMatchObject({ statistics: null, statisticsEnabled: false });
  });

  it('включён: зритель видит статистику, включая монеты', async () => {
    const { service } = build({ enabled: true });
    const res = await service.getProfileSummary('Steve', null);
    expect(res).toMatchObject({
      statisticsEnabled: true,
      statisticsHidden: false,
      statistics: {
        playTimeMinutes: 125,
        kills: 7,
        deaths: 2,
        killDeathRatio: 3.5,
        coins: 40,
      },
    });
  });

  it('hideStatistics: зритель получает null и признак скрытия, владелец видит свои цифры', async () => {
    const { service } = build({ enabled: true, hideStatistics: true });
    const other = await service.getProfileSummary('Steve', 'other');
    expect(other).toMatchObject({ statistics: null, statisticsHidden: true });
    const own = await service.getProfileSummary('Steve', 'u1');
    expect(own).toMatchObject({ statisticsHidden: false });
    expect((own as { statistics: unknown }).statistics).not.toBeNull();
  });

  it('закрытый профиль (NOBODY): только ник и hidden, никаких полей статистики', async () => {
    const { service } = build({ enabled: true, profileVisibility: 'NOBODY' });
    const res = await service.getProfileSummary('Steve', 'other');
    expect(res).toEqual({ username: 'Steve', hidden: true });
  });

  it('нет данных с сервера: null, а не нули', async () => {
    const { service } = build({ enabled: true, statistics: null });
    const res = await service.getProfileSummary('Steve', null);
    expect(res).toMatchObject({ statistics: null, statisticsHidden: false });
  });

  it('в публичный ответ не попадают lastServer и hits', async () => {
    const { service } = build({ enabled: true });
    const res = JSON.stringify(await service.getProfileSummary('Steve', null));
    expect(res).not.toMatch(/lastServer|hits/);
  });
});
