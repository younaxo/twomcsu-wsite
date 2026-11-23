import { UsersSearchService } from './users-search.service';

describe('UsersSearchService (Q73)', () => {
  const rows = [
    { id: '1', username: 'Alex', tag: 'Alex#0001', avatar: null },
    { id: '2', username: 'Malex', tag: 'Malex#0002', avatar: 'a.png' },
    { id: '3', username: 'Zalex', tag: 'Zalex#0003', avatar: null },
  ];
  const make = (result = rows) => {
    const findMany = jest.fn().mockResolvedValue(result);
    const service = new UsersSearchService(
      { user: { findMany } } as never,
      { publicUrl: (v: string | null) => (v ? `/f/${v}` : null) } as never,
    );
    return { service, findMany };
  };

  it('фильтрует только открытые, не заблокированные и не системные профили', async () => {
    const { service, findMany } = make();
    await service.search('al_x', 1, 20);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      username: { contains: 'al_x', mode: 'insensitive' },
      profileVisibility: 'EVERYONE',
      isBanned: false,
      accountType: { not: 'SYSTEM' },
    });
    expect(args.take).toBe(21);
    expect(args.select).toEqual({
      id: true,
      username: true,
      tag: true,
      avatar: true,
    });
  });

  it('отдаёт только публичные поля, без id', async () => {
    const { service } = make();
    const res = await service.search('al', 1, 20);
    expect(res.items[0]).toEqual({
      username: 'Alex',
      tag: 'Alex#0001',
      avatar: null,
    });
    expect(res.items[1].avatar).toBe('/f/a.png');
    expect(Object.keys(res.items[0])).not.toContain('id');
  });

  it('префикс идёт раньше вхождения, hasMore по лишней строке', async () => {
    const { service } = make();
    const res = await service.search('al', 2, 2);
    expect(res.items.map((i) => i.username)).toEqual(['Alex', 'Malex']);
    expect(res.hasMore).toBe(true);
    const { service: s2, findMany } = make();
    await s2.search('al', 2, 2);
    expect(findMany.mock.calls[0][0].skip).toBe(2);
  });
});
