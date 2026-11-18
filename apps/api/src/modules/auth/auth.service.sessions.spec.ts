import { AuthService } from './auth.service';

describe('AuthService.listSessions: личный журнал (0.6)', () => {
  function build(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new AuthService(
      { refreshToken: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('IP маскируется, current отмечается, токены/хеши не запрашиваются', async () => {
    const createdAt = new Date('2026-11-18T10:00:00Z');
    const { service, findMany } = build([
      {
        id: 's1',
        userAgent: 'UA',
        ipAddress: '203.0.113.77',
        createdAt,
        expiresAt: createdAt,
      },
      {
        id: 's2',
        userAgent: null,
        ipAddress: null,
        createdAt,
        expiresAt: createdAt,
      },
    ]);
    const res = await service.listSessions('u1', 's1');
    expect(res[0]).toMatchObject({
      id: 's1',
      ipAddress: '203.0.*.*',
      current: true,
    });
    expect(res[1]).toMatchObject({ ipAddress: null, current: false });
    expect(JSON.stringify(res)).not.toContain('203.0.113.77');
    const select = findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'ipAddress',
      'userAgent',
    ]);
    expect(findMany.mock.calls[0][0].where.userId).toBe('u1');
  });
});
