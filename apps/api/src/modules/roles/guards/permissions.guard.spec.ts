import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permission.service';
import { Logger } from '@nestjs/common';
import {
  isAdmin2faDenied,
  PermissionsGuard,
  resetAdmin2faCache,
  resetAdmin2faKeyWarning,
} from './permissions.guard';

const KEY = 'k'.repeat(32);

function setup(opts: {
  env: string;
  key: string;
  requireFlag: boolean;
  twoFactorEnabled: boolean;
}) {
  const findFirst = jest
    .fn()
    .mockResolvedValue({ requireAdmin2fa: opts.requireFlag });
  const prisma = { siteSettings: { findFirst } } as unknown as PrismaService;
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
  const guard = new PermissionsGuard(reflector, permissions, prisma, config);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'u1', twoFactorEnabled: opts.twoFactorEnabled },
      }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context, prisma, config, findFirst };
}

describe('PermissionsGuard admin-2FA (ADR-0156)', () => {
  beforeEach(() => resetAdmin2faCache());

  it('production без ключа и requireAdmin2fa=true — отказ даже при twoFactorEnabled', async () => {
    const { guard, context } = setup({
      env: 'production',
      key: '',
      requireFlag: true,
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
  ])(
    '%s без ключа и requireAdmin2fa=true — отказ (fail-closed, ADR-0164)',
    async (_name, env) => {
      const { guard, context } = setup({
        env: env as string,
        key: '',
        requireFlag: true,
        twoFactorEnabled: true,
      });
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { code: 'admin_2fa_required' },
      });
    },
  );

  it('test без ключа сохраняет прежнее поведение (пропуск)', async () => {
    const { guard, context } = setup({
      env: 'test',
      key: '',
      requireFlag: true,
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('production с коротким ключом — отказ (fail-closed)', async () => {
    const { guard, context } = setup({
      env: 'production',
      key: 'short',
      requireFlag: true,
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('production без ключа, но requireAdmin2fa=false — пропуск', async () => {
    const { guard, context } = setup({
      env: 'production',
      key: '',
      requireFlag: false,
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('development без ключа сохраняет прежнее поведение (пропуск)', async () => {
    const { guard, context, findFirst } = setup({
      env: 'development',
      key: '',
      requireFlag: true,
      twoFactorEnabled: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('production с ключом: без 2FA — отказ, с 2FA — пропуск', async () => {
    const denied = setup({
      env: 'production',
      key: KEY,
      requireFlag: true,
      twoFactorEnabled: false,
    });
    await expect(
      denied.guard.canActivate(denied.context),
    ).rejects.toMatchObject({ response: { code: 'admin_2fa_required' } });
    resetAdmin2faCache();
    const ok = setup({
      env: 'production',
      key: KEY,
      requireFlag: true,
      twoFactorEnabled: true,
    });
    await expect(ok.guard.canActivate(ok.context)).resolves.toBe(true);
  });

  it('isAdmin2faDenied: общий путь для WS и контроллеров', async () => {
    const { prisma, config } = setup({
      env: 'production',
      key: KEY,
      requireFlag: true,
      twoFactorEnabled: false,
    });
    await expect(
      isAdmin2faDenied({ twoFactorEnabled: false }, prisma, config),
    ).resolves.toBe(true);
    await expect(
      isAdmin2faDenied({ twoFactorEnabled: true }, prisma, config),
    ).resolves.toBe(false);
  });

  it('ключ из пробелов считается отсутствующим (production — отказ)', async () => {
    const { prisma, config } = setup({
      env: 'production',
      key: ' '.repeat(32),
      requireFlag: true,
      twoFactorEnabled: true,
    });
    await expect(
      isAdmin2faDenied({ twoFactorEnabled: true }, prisma, config),
    ).resolves.toBe(true);
  });

  it('вне production без ключа — одно предупреждение при старте', () => {
    resetAdmin2faKeyWarning();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    setup({
      env: 'development',
      key: '',
      requireFlag: true,
      twoFactorEnabled: false,
    });
    setup({
      env: 'development',
      key: '',
      requireFlag: true,
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
      requireFlag: true,
      twoFactorEnabled: false,
    });
    setup({
      env: 'production',
      key: '',
      requireFlag: true,
      twoFactorEnabled: false,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
