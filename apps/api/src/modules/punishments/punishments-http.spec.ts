import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  NO_STORE,
  PUBLIC_CACHE_CONTROL,
  PunishmentsErrorHeadersFilter,
  PunishmentsPublicEnabledGuard,
  etagMatches,
  sendPublic,
  setPrivateNoStore,
} from './punishments-http';
import {
  issuerHideForbidden,
  punishmentNotFound,
  punishmentsPublicDisabled,
  punishmentsUnavailable,
} from './punishments-errors';
import type { PunishmentsSettingsService } from './punishments-settings.service';

/// Тест-план п.3, 14, 15, 16: guard «раздел выключен», заголовки ошибок, ETag.
interface FakeRes {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  setHeader: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader: jest.fn((k: string, v: string) => {
      res.headers[k] = v;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((b: unknown) => {
      res.body = b;
      return res;
    }),
  };
  return res;
}

function host(res: FakeRes): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

describe('PunishmentsPublicEnabledGuard', () => {
  it('раздел включён - пропускает', async () => {
    const settings = {
      isPublicEnabled: jest.fn().mockResolvedValue(true),
    } as unknown as PunishmentsSettingsService;
    await expect(
      new PunishmentsPublicEnabledGuard(settings).canActivate(),
    ).resolves.toBe(true);
  });

  it('раздел выключен - 404 punishments_public_disabled (до валидации query)', async () => {
    const settings = {
      isPublicEnabled: jest.fn().mockResolvedValue(false),
    } as unknown as PunishmentsSettingsService;
    const guard = new PunishmentsPublicEnabledGuard(settings);
    await expect(guard.canActivate()).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate()).rejects.toMatchObject({
      response: { statusCode: 404, code: 'punishments_public_disabled' },
    });
  });
});

describe('PunishmentsErrorHeadersFilter (п.15)', () => {
  const filter = new PunishmentsErrorHeadersFilter();

  it('404: no-store, noindex, без Retry-After, тело сохраняется', () => {
    const res = fakeRes();
    filter.catch(punishmentNotFound(), host(res));
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
    expect(res.headers['Retry-After']).toBeUndefined();
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'punishments_not_found' });
  });

  it('503: Retry-After 60 и noindex', () => {
    const res = fakeRes();
    filter.catch(punishmentsUnavailable(), host(res));
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.statusCode).toBe(503);
  });

  it.each([
    ['400', new BadRequestException(['x'])],
    ['403', issuerHideForbidden()],
    ['429', new HttpException('Too Many Requests', 429)],
  ])('%s: no-store, без noindex и Retry-After', (_n, exc) => {
    const res = fakeRes();
    filter.catch(exc, host(res));
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Robots-Tag']).toBeUndefined();
    expect(res.headers['Retry-After']).toBeUndefined();
  });

  it('строковый ответ оборачивается в объект с statusCode', () => {
    const res = fakeRes();
    filter.catch(new HttpException('Too Many Requests', 429), host(res));
    expect(res.body).toEqual({
      statusCode: 429,
      message: 'Too Many Requests',
    });
  });

  it('тела 404 «не найдено» одинаковы для любой причины (п.3)', () => {
    const a = punishmentNotFound().getResponse();
    const b = punishmentNotFound().getResponse();
    expect(a).toEqual(b);
    expect(punishmentsPublicDisabled().getResponse()).toMatchObject({
      statusCode: 404,
      code: 'punishments_public_disabled',
    });
    expect(new ServiceUnavailableException().getStatus()).toBe(503);
    expect(new ForbiddenException().getStatus()).toBe(403);
  });
});

describe('etagMatches', () => {
  const etag = 'W/"abc"';
  it('точное, слабое, список и *', () => {
    expect(etagMatches('W/"abc"', etag)).toBe(true);
    expect(etagMatches('"abc"', etag)).toBe(true);
    expect(etagMatches('W/"x", W/"abc"', etag)).toBe(true);
    expect(etagMatches('*', etag)).toBe(true);
    expect(etagMatches('W/"x"', etag)).toBe(false);
    expect(etagMatches(undefined, etag)).toBe(false);
    expect(etagMatches('', etag)).toBe(false);
  });
});

describe('sendPublic (п.16)', () => {
  const body = {
    items: [],
    nextCursor: null,
    meta: { generatedAt: '2026-01-01T00:00:00Z', stale: false },
  };
  const reqOf = (inm?: string) =>
    ({ headers: inm ? { 'if-none-match': inm } : {} }) as unknown as Request;

  it('200: ETag, Cache-Control, X-Robots-Tag; тело возвращается', () => {
    const res = fakeRes();
    const out = sendPublic(reqOf(), res as unknown as Response, body);
    expect(out).toBe(body);
    expect(res.headers['ETag']).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(res.headers['Cache-Control']).toBe(PUBLIC_CACHE_CONTROL);
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('If-None-Match с тем же ETag - 304 без тела', () => {
    const first = fakeRes();
    sendPublic(reqOf(), first as unknown as Response, body);
    const etag = first.headers['ETag'];
    const res = fakeRes();
    const out = sendPublic(reqOf(etag), res as unknown as Response, body);
    expect(out).toBeUndefined();
    expect(res.statusCode).toBe(304);
  });

  it('другой generatedAt не меняет ETag и даёт 304', () => {
    const first = fakeRes();
    sendPublic(reqOf(), first as unknown as Response, body);
    const res = fakeRes();
    const out = sendPublic(
      reqOf(first.headers['ETag']),
      res as unknown as Response,
      { ...body, meta: { generatedAt: '2026-02-02T00:00:00Z', stale: false } },
    );
    expect(out).toBeUndefined();
    expect(res.statusCode).toBe(304);
  });

  it('изменённые данные - не 304', () => {
    const first = fakeRes();
    sendPublic(reqOf(), first as unknown as Response, body);
    const res = fakeRes();
    const out = sendPublic(
      reqOf(first.headers['ETag']),
      res as unknown as Response,
      { ...body, nextCursor: 'zzz' },
    );
    expect(out).toBeDefined();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('setPrivateNoStore', () => {
  it('private no-store и Vary Authorization, без ETag', () => {
    const res = fakeRes();
    setPrivateNoStore(res as unknown as Response);
    expect(res.headers['Cache-Control']).toBe(NO_STORE);
    expect(res.headers['Vary']).toBe('Authorization');
    expect(res.headers['ETag']).toBeUndefined();
  });
});
