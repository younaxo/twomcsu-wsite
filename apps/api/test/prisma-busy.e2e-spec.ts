import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// ADR-0183: при исчерпанном пуле Prisma клиент получает 503 busy с
// Retry-After, а не 500. Пул сжимается до одного соединения только в этом
// файле: DATABASE_URL и PRISMA_TX_* меняются до создания приложения и
// возвращаются в afterAll (БД - одноразовая e2e-БД, не production).
jest.setTimeout(30_000);

describe('Prisma: пул исчерпан (e2e, ADR-0183)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const saved = {
    url: process.env.DATABASE_URL,
    maxWait: process.env.PRISMA_TX_MAX_WAIT_MS,
    timeout: process.env.PRISMA_TX_TIMEOUT_MS,
  };

  beforeAll(async () => {
    const url = saved.url ?? '';
    process.env.DATABASE_URL = `${url}${url.includes('?') ? '&' : '?'}connection_limit=1&pool_timeout=1`;
    process.env.PRISMA_TX_MAX_WAIT_MS = '1000';
    process.env.PRISMA_TX_TIMEOUT_MS = '10000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('DATABASE_URL', saved.url);
    restore('PRISMA_TX_MAX_WAIT_MS', saved.maxWait);
    restore('PRISMA_TX_TIMEOUT_MS', saved.timeout);
  });

  it('PrismaService получил опции транзакций из конфигурации', () => {
    expect(prisma.transactionDefaults).toEqual({
      maxWait: 1000,
      timeout: 10_000,
    });
  });

  it('единственное соединение занято: параллельные запросы -> 503 busy с Retry-After, не 500', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const holding = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hostage = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      started();
      await hold;
    });
    await holding;

    try {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app.getHttpServer()).get('/voting'),
        ),
      );
      for (const res of responses) {
        expect(res.status).toBe(503);
        expect(res.body).toEqual({
          statusCode: 503,
          code: 'busy',
          message: 'Сервер занят, повторите запрос позже',
        });
        expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(res.body)).not.toMatch(
          /prisma|P20\d\d|invocation/i,
        );
      }
    } finally {
      release();
      await hostage;
    }

    // После освобождения соединения сервис снова отвечает.
    await request(app.getHttpServer()).get('/voting').expect(200);
  });
});
