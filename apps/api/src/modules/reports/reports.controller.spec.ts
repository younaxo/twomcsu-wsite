import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionService } from '../roles/permission.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/// ADR-0169: чтение обращения по праву персонала требует 2FA.
describe('ReportsController.getOne: 2FA персонала', () => {
  const KEY = 'k'.repeat(32);

  function setup(opts: { isStaff: boolean; key?: string }) {
    const getByNumber = jest.fn().mockResolvedValue({ ok: true });
    const reports = { getByNumber } as unknown as ReportsService;
    const permissions = {
      hasPermission: jest.fn().mockResolvedValue(opts.isStaff),
    } as unknown as PermissionService;
    const config = {
      get: (name: string, def?: string) =>
        name === 'TWO_FACTOR_ENCRYPTION_KEY'
          ? (opts.key ?? KEY)
          : name === 'NODE_ENV'
            ? 'test'
            : def,
    } as unknown as ConfigService;
    return {
      getByNumber,
      controller: new ReportsController(reports, permissions, config),
    };
  }

  const user = (twoFactorEnabled: boolean) =>
    ({ id: 'u1', twoFactorEnabled }) as AuthenticatedUser;

  it('игрок (не персонал) без 2FA: вид игрока, без флага отказа', async () => {
    const { controller, getByNumber } = setup({ isStaff: false });
    await controller.getOne(user(false), 'R-1');
    expect(getByNumber).toHaveBeenCalledWith('R-1', 'u1', false, false);
  });

  it('персонал без 2FA при наличии ключа: staff-вид не выдаётся, флаг отказа', async () => {
    const { controller, getByNumber } = setup({ isStaff: true });
    await controller.getOne(user(false), 'R-1');
    expect(getByNumber).toHaveBeenCalledWith('R-1', 'u1', false, true);
  });

  it('персонал с 2FA: staff-вид', async () => {
    const { controller, getByNumber } = setup({ isStaff: true });
    await controller.getOne(user(true), 'R-1');
    expect(getByNumber).toHaveBeenCalledWith('R-1', 'u1', true, false);
  });
});
