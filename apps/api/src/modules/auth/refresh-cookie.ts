import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

export function refreshCookieOptions(
  config: ConfigService,
  maxAgeMs?: number,
): CookieOptions {
  const sameSite = config.get<'lax' | 'strict' | 'none'>(
    'COOKIE_SAMESITE',
    'lax',
  );
  // 'localhost' — значение по умолчанию для dev/test, где реальный хост запроса
  // может быть 127.0.0.1 (supertest, некоторые браузеры) и не совпадёт по строгим
  // правилам сопоставления домена cookie. В этом случае Domain не выставляется
  // вовсе — браузер определяет его сам по хосту запроса. В production
  // COOKIE_DOMAIN задаётся явно (например ".twomc.su") и используется как есть.
  const cookieDomain = config.get<string>('COOKIE_DOMAIN', 'localhost');
  const domain = cookieDomain === 'localhost' ? undefined : cookieDomain;
  return {
    httpOnly: true,
    path: '/',
    ...(domain ? { domain } : {}),
    secure: config.get<boolean>('COOKIE_SECURE'),
    sameSite,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}
