import { AuthController } from './auth.controller';
import { TWO_FACTOR_COOKIE_NAME } from './refresh-cookie';

// Сырой req.ip доходит до сервиса как rateLimitIp, ip нормализован (ADR-0163).
function makeController() {
  const authService = {
    login: jest
      .fn()
      .mockResolvedValue({ twoFactorRequired: true, challengeId: 'c' }),
    completeTwoFactorLogin: jest.fn().mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'a',
      refreshToken: 'r',
      refreshTokenExpiresAt: new Date(Date.now() + 1000),
    }),
  };
  const config = {
    get: jest.fn((_k: string, fallback?: unknown) => fallback),
  };
  const controller = new AuthController(
    authService as never,
    {} as never,
    config as never,
    {} as never,
    {} as never,
  );
  return { controller, authService };
}

const req = {
  ip: '::ffff:1.2.3.4',
  socket: { remoteAddress: '9.9.9.9' },
  cookies: { [TWO_FACTOR_COOKIE_NAME]: 'c' },
  get: () => 'jest',
} as never;
const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;

describe('AuthController: requestContext.rateLimitIp = сырой req.ip', () => {
  it('login: rateLimitIp сырой, ip нормализован', async () => {
    const { controller, authService } = makeController();
    await controller.login({} as never, req, res);
    expect(authService.login).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        ip: '1.2.3.4',
        rateLimitIp: '::ffff:1.2.3.4',
      }),
    );
  });

  it('loginTwoFactor: rateLimitIp сырой, ip нормализован', async () => {
    const { controller, authService } = makeController();
    await controller.loginTwoFactor({ code: '123456' } as never, req, res);
    expect(authService.completeTwoFactorLogin).toHaveBeenCalledWith(
      expect.anything(),
      '123456',
      expect.objectContaining({
        ip: '1.2.3.4',
        rateLimitIp: '::ffff:1.2.3.4',
      }),
    );
  });
});
