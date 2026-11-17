import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../permission.service';
import { Logger } from '@nestjs/common';
import {
  isAdmin2faDenied,
  PermissionsGuard,
  resetAdmin2faKeyWarning,
} from './permissions.guard';

const KEY = 'k'.repeat(32);

function setup(opts: { env: string; key: string; twoFactorEnabled: boolean }) {
  const config = {
    get: (name: string, fallback?: unknown) =>
      name === 'NODE_ENV'
        ? opts.env
        : name === 'TWO_FACTOR_ENCRYPTION_KEY'
          ? opts.key
          : fallback,
  } as unknown as ConfigService;
  const reflector = {
    getAllAndOverride: () => ['admin.x'],
  } as unknown as Reflector;
  const permissions = {
    hasAllPermissions: jest.fn().mockResolvedValue(true),
  } as unknown as PermissionService;
  const guard = new PermissionsGuard(reflector, permissions, config);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'u1', twoFactorEnabled: opts.twoFactorEnabled },
      }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context, config };
}

describe('PermissionsGuard admin-2FA (ADR-0156)', () => {
  it('production без ключа — отказ даже при twoFactorEnabled', async () => {
    const { guard, context } = setup({
      env: 'production',
      key: '',
      twoFactorEnabled: true,
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'admin_2fa_required' },
    });
  });

  it.each([
    ['пустой NODE_ENV', ''],
    ['не заданный NODE_ENV', undefined],
    ['неизвестный NODE_ENV (staging)', 'staging'],
  ])('%s без ключа — отказ (fail-closed, ADR-0164)', async (_name, env) => {
    const { guard, context } = setup({
      env: env as string,
      key: '',
      twoFactorEnabled: true,
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'admin_2fa_required' },
    });
  });

  it('test без ключа сохраняет прежнее поведение (пропуск)', async () => {
    const { guard, context } = setup({
      env: 'test',
      key: '',
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('production с коротким ключом — отказ (fail-closed)', async () => {
    const { guard, context } = setup({
      env: 'production',
      key: 'short',
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('development без ключа сохраняет прежнее поведение (пропуск)', async () => {
    const { guard, context } = setup({
      env: 'development',
      key: '',
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('production с ключом: без 2FA — отказ, с 2FA — пропуск', async () => {
    const denied = setup({
      env: 'production',
      key: KEY,
      twoFactorEnabled: false,
    });
    await expect(
      denied.guard.canActivate(denied.context),
    ).rejects.toMatchObject({ response: { code: 'admin_2fa_required' } });
    const ok = setup({
      env: 'production',
      key: KEY,
      twoFactorEnabled: true,
    });
    await expect(ok.guard.canActivate(ok.context)).resolves.toBe(true);
  });

  it('isAdmin2faDenied: общий путь для WS и контроллеров', () => {
    const { config } = setup({
      env: 'production',
      key: KEY,
      twoFactorEnabled: false,
    });
    expect(isAdmin2faDenied({ twoFactorEnabled: false }, config)).toBe(true);
    expect(isAdmin2faDenied({ twoFactorEnabled: true }, config)).toBe(false);
  });

  it('ключ из пробелов считается отсутствующим (production — отказ)', () => {
    const { config } = setup({
      env: 'production',
      key: ' '.repeat(32),
      twoFactorEnabled: true,
    });
    expect(isAdmin2faDenied({ twoFactorEnabled: true }, config)).toBe(true);
  });

  it('вне production без ключа — одно предупреждение при старте', () => {
    resetAdmin2faKeyWarning();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    setup({
      env: 'development',
      key: '',
      twoFactorEnabled: false,
    });
    setup({
      env: 'development',
      key: '',
      twoFactorEnabled: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
    warn.mockRestore();
  });

  it('с ключом или в production предупреждения нет', () => {
    resetAdmin2faKeyWarning();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    setup({
      env: 'development',
      key: KEY,
      twoFactorEnabled: false,
    });
    setup({
      env: 'production',
      key: '',
      twoFactorEnabled: false,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
