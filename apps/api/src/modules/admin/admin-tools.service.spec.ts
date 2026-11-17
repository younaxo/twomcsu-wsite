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
});
