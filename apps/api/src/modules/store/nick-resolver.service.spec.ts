import { NickResolver } from './nick-resolver.service';

function setup(account: string | null, mirrored: string | null) {
  const base = {
    minecraftAccount: {
      findFirst: jest
        .fn()
        .mockResolvedValue(account === null ? null : { name: account }),
      findUnique: jest.fn(),
    },
  };
  const queryRaw = jest
    .fn()
    .mockResolvedValue(mirrored === null ? [] : [{ subjectName: mirrored }]);
  const prisma = { ...base, $queryRaw: queryRaw };
  return { prisma, resolver: new NickResolver(prisma as never) };
}

describe('NickResolver (R158)', () => {
  it.each(['', 'ab', 'bad nick', 'bad-nick', 'a'.repeat(17), 'Ник123'])(
    'неверный формат %j — null без обращения к БД',
    async (nick) => {
      const { prisma, resolver } = setup('Steve', 'Steve');
      await expect(resolver.resolve(nick)).resolves.toBeNull();
      expect(prisma.minecraftAccount.findFirst).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('аккаунт сайта: каноническое написание', async () => {
    const { resolver } = setup('Steve_1', null);
    await expect(resolver.resolve('steve_1')).resolves.toBe('Steve_1');
  });

  it('зеркало наказаний: ник известен, когда аккаунта нет', async () => {
    const { resolver } = setup(null, 'Alex_9');
    await expect(resolver.resolve('ALEX_9')).resolves.toBe('Alex_9');
  });

  it('оба источника опрашиваются всегда (нет раннего возврата)', async () => {
    const { prisma, resolver } = setup('Steve', 'Steve');
    await resolver.resolve('Steve');
    expect(prisma.minecraftAccount.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('ни один источник не дал результата — null (fail closed)', async () => {
    const { resolver } = setup(null, null);
    await expect(resolver.resolve('Nobody')).resolves.toBeNull();
  });
});
