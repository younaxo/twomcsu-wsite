import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionService } from '../roles/permission.service';
import { FilesService } from './files.service';
import { UPLOAD_PRESETS, type UploadType } from './upload-types';

/// ADR-0169: загрузка по праву персонала требует 2FA.
describe('FilesService.assertCanUpload: 2FA персонала', () => {
  const KEY = 'k'.repeat(32);

  const staffType = (Object.keys(UPLOAD_PRESETS) as UploadType[]).find(
    (t) => UPLOAD_PRESETS[t].permission,
  )!;
  const userType = (Object.keys(UPLOAD_PRESETS) as UploadType[]).find(
    (t) => !UPLOAD_PRESETS[t].permission && !UPLOAD_PRESETS[t].allowAnonymous,
  );

  function build(allowed: boolean) {
    const permissions = {
      hasAllPermissions: jest.fn().mockResolvedValue(allowed),
    } as unknown as PermissionService;
    const config = {
      get: (name: string, def?: string) =>
        name === 'TWO_FACTOR_ENCRYPTION_KEY'
          ? KEY
          : name === 'NODE_ENV'
            ? 'test'
            : def,
    } as unknown as ConfigService;
    return new FilesService({} as never, {} as never, permissions, config);
  }

  it('персонал с правом без 2FA — 403 admin_2fa_required', async () => {
    const service = build(true);
    await expect(
      service.assertCanUpload(staffType, 'u1', { twoFactorEnabled: false }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'admin_2fa_required' },
    });
  });

  it('персонал с правом и 2FA — доступ есть', async () => {
    const service = build(true);
    await expect(
      service.assertCanUpload(staffType, 'u1', { twoFactorEnabled: true }),
    ).resolves.toBeUndefined();
  });

  it('нет права — обычный 403 без кода 2FA', async () => {
    const service = build(false);
    await expect(
      service.assertCanUpload(staffType, 'u1', { twoFactorEnabled: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('загрузка без права персонала (обычный пользователь без 2FA) — не затронута', async () => {
    if (!userType) return;
    const service = build(false);
    await expect(
      service.assertCanUpload(userType, 'u1', { twoFactorEnabled: false }),
    ).resolves.toBeUndefined();
  });
});
