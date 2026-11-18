import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isPrismaBusyCode,
  PrismaExceptionFilter,
} from './prisma-exception.filter';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Invalid `prisma.user.findMany()` invocation: secret table detail',
    { code, clientVersion: 'test', meta: { target: 'users_email_key' } },
  );
}

function run(error: Prisma.PrismaClientKnownRequestError, url = '/forms/x') {
  const headers: Record<string, string> = {};
  let status = 0;
  let body: unknown;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: (s: number) => {
      status = s;
      return res;
    },
    json: (b: unknown) => {
      body = b;
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'POST', originalUrl: url, url }),
    }),
  } as unknown as ArgumentsHost;
  new PrismaExceptionFilter().catch(error, host);
  return { status, body, headers };
}

describe('PrismaExceptionFilter (ADR-0183)', () => {
  it.each([
    ['P2028', '2'],
    ['P2024', '2'],
    ['P2034', '1'],
  ])('%s -> 503 busy с Retry-After %s', (code, retry) => {
    const out = run(prismaError(code));
    expect(out.status).toBe(503);
    expect(out.body).toEqual({
      statusCode: 503,
      code: 'busy',
      message: 'Сервер занят, повторите запрос позже',
    });
    expect(out.headers['Retry-After']).toBe(retry);
    expect(out.headers['Cache-Control']).toBe('no-store');
  });

  it('прочие коды -> 500 без деталей Prisma', () => {
    const out = run(prismaError('P2002'));
    expect(out.status).toBe(500);
    expect(out.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(out.body)).not.toMatch(
      /users_email_key|secret|P2002/,
    );
    expect(out.headers['Retry-After']).toBeUndefined();
  });

  it('тело 503 не содержит текста и meta ошибки', () => {
    const out = run(prismaError('P2028'));
    expect(JSON.stringify(out.body)).not.toMatch(
      /secret|users_email_key|invocation/,
    );
  });

  it('путь /bridge/v1: тело { error: unavailable }, Retry-After 5', () => {
    const out = run(prismaError('P2028'), '/bridge/v1/events');
    expect(out.status).toBe(503);
    expect(out.body).toEqual({ error: 'unavailable' });
    expect(out.headers['Retry-After']).toBe('5');
  });

  it('путь /bridge/v1 без учёта регистра', () => {
    const out = run(prismaError('P2024'), '/BRIDGE/V1/Events?x=1');
    expect(out.status).toBe(503);
    expect(out.body).toEqual({ error: 'unavailable' });
    expect(out.headers['Retry-After']).toBe('5');
  });

  it('не-http контекст: исключение пробрасывается, а не глотается', () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const error = prismaError('P2028');
    expect(() => new PrismaExceptionFilter().catch(error, host)).toThrow(error);
  });

  it('isPrismaBusyCode', () => {
    expect(isPrismaBusyCode('P2028')).toBe(true);
    expect(isPrismaBusyCode('P2002')).toBe(false);
    expect(isPrismaBusyCode('toString')).toBe(false);
  });
});
