import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, RequestContext } from './auth.service';

jest.mock('bcrypt');

// Различимые значения: нормализованный ip и сырой rateLimitIp (ADR-0163).
const CONTEXT: RequestContext = {
  ip: '1.2.3.4',
  rateLimitIp: '::ffff:1.2.3.4',
  userAgent: 'jest',
};

const USER = {
  id: 'u1',
  email: 'a@b.c',
  username: 'alice',
  password: 'hash',
  accountType: 'USER',
  isBanned: false,
  twoFactorEnabled: false,
};

function makeService() {
  const bruteForce = {
    isBlocked: jest.fn().mockResolvedValue(false),
    registerFailure: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    loginAlias: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findFirst: jest.fn().mockResolvedValue(USER),
      findUnique: jest.fn().mockResolvedValue(USER),
      update: jest.fn().mockResolvedValue(USER),
    },
    refreshToken: { create: jest.fn().mockResolvedValue({ id: 'sid-1' }) },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const config = {
    get: jest.fn((_key: string, fallback?: unknown) => fallback),
  };
  const captcha = { verify: jest.fn().mockResolvedValue(true) };
  const twoFactor = {
    createChallenge: jest.fn().mockResolvedValue('challenge'),
    completeChallenge: jest.fn().mockResolvedValue({ userId: 'u1' }),
  };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    bruteForce as never,
    captcha as never,
    {} as never,
    twoFactor as never,
  );
  return { service, bruteForce, twoFactor };
}

const LOGIN_DTO = {
  emailOrUsername: 'alice',
  password: 'pw',
  captchaToken: 't',
} as never;

describe('AuthService: ключ brute-force = context.rateLimitIp (ADR-0163)', () => {
  const compare = bcrypt.compare as jest.Mock;

  beforeEach(() => {
    compare.mockReset();
  });

  it('login: isBlocked и reset получают rateLimitIp, а не ip', async () => {
    compare.mockResolvedValue(true);
    const { service, bruteForce } = makeService();
    await service.login(LOGIN_DTO, CONTEXT);
    expect(bruteForce.isBlocked).toHaveBeenCalledTimes(1);
    expect(bruteForce.isBlocked).toHaveBeenCalledWith('::ffff:1.2.3.4');
    expect(bruteForce.reset).toHaveBeenCalledTimes(1);
    expect(bruteForce.reset).toHaveBeenCalledWith('::ffff:1.2.3.4');
  });

  it('login: registerFailure на неверный пароль получает rateLimitIp', async () => {
    compare.mockResolvedValue(false);
    const { service, bruteForce } = makeService();
    await expect(service.login(LOGIN_DTO, CONTEXT)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(bruteForce.registerFailure).toHaveBeenCalledTimes(1);
    expect(bruteForce.registerFailure).toHaveBeenCalledWith('::ffff:1.2.3.4');
  });

  it('login: без rateLimitIp ключ откатывается на ip', async () => {
    compare.mockResolvedValue(false);
    const { service, bruteForce } = makeService();
    await expect(
      service.login(LOGIN_DTO, { ip: '1.2.3.4' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bruteForce.isBlocked).toHaveBeenCalledWith('1.2.3.4');
    expect(bruteForce.registerFailure).toHaveBeenCalledWith('1.2.3.4');
  });

  it('2FA: isBlocked и reset получают rateLimitIp, а не ip', async () => {
    const { service, bruteForce } = makeService();
    await service.completeTwoFactorLogin('challenge', '123456', CONTEXT);
    expect(bruteForce.isBlocked).toHaveBeenCalledTimes(1);
    expect(bruteForce.isBlocked).toHaveBeenCalledWith('::ffff:1.2.3.4');
    expect(bruteForce.reset).toHaveBeenCalledTimes(1);
    expect(bruteForce.reset).toHaveBeenCalledWith('::ffff:1.2.3.4');
  });

  it('2FA: registerFailure на неверный код получает rateLimitIp', async () => {
    const { service, bruteForce, twoFactor } = makeService();
    twoFactor.completeChallenge.mockRejectedValue(new UnauthorizedException());
    await expect(
      service.completeTwoFactorLogin('challenge', '000000', CONTEXT),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bruteForce.registerFailure).toHaveBeenCalledTimes(1);
    expect(bruteForce.registerFailure).toHaveBeenCalledWith('::ffff:1.2.3.4');
  });
});
