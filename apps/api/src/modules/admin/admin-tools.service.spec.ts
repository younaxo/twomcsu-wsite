import { PrismaService } from '../prisma/prisma.service';
import { AdminToolsService } from './admin-tools.service';

describe('AdminToolsService.getSiteSettings', () => {
  it('не отдаёт deprecated-поле requireAdmin2fa (Q22/Q44)', async () => {
    const row = {
      id: 'singleton',
      siteName: 'TwoMC',
      registrationEnabled: true,
      requireAdmin2fa: true,
    };
    const prisma = {
      siteSettings: { findFirst: jest.fn().mockResolvedValue(row) },
    } as unknown as PrismaService;
    const service = new AdminToolsService(prisma, {} as never, {} as never);
    const res = await service.getSiteSettings();
    expect(res).not.toHaveProperty('requireAdmin2fa');
    expect(res).toMatchObject({ siteName: 'TwoMC', registrationEnabled: true });
  });

  it('updateSiteSettings не отдаёт requireAdmin2fa ни в ответе, ни в аудите', async () => {
    const row = { id: 'singleton', siteName: 'A', requireAdmin2fa: true };
    const updated = { ...row, siteName: 'B' };
    const prisma = {
      siteSettings: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue(updated),
      },
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminToolsService(prisma, {} as never, audit as never);
    const res = await service.updateSiteSettings(
      { siteName: 'B' } as never,
      'admin-1',
    );
    expect(res).not.toHaveProperty('requireAdmin2fa');
    expect(res).toMatchObject({ siteName: 'B' });
    const changes = audit.log.mock.calls[0][0].changes;
    expect(changes.before).not.toHaveProperty('requireAdmin2fa');
    expect(changes.after).not.toHaveProperty('requireAdmin2fa');
    expect(changes.after).toMatchObject({ siteName: 'B' });
  });
});
