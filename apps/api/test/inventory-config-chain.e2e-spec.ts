import { restoreBridgeEnabled } from './support/force-bridge-disabled';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// M3: `GET /inventory/me` при `BRIDGE_ENABLED=false` отвечает 503 через
/// РЕАЛЬНУЮ цепочку конфигурации: без `overrideGuard`, боевой
/// `InventoryEnabledGuard` читает значение из `ConfigService`, которое
/// провалидировала и привела к булеву Joi-схема приложения. Значение
/// выставляет `force-bridge-disabled` до импорта `AppModule` (первая строка).
///
/// Запуск - только на ОДНОРАЗОВОЙ локальной БД. Тест создаёт одного
/// пользователя и удаляет его в afterAll.
describe('Inventory: fail-closed через реальную конфигурацию (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const userIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      try {
        await app.close();
      } finally {
        restoreBridgeEnabled();
      }
    }
  });

  it('ConfigService отдаёт BRIDGE_ENABLED как булево false (после Joi)', () => {
    expect(app.get(ConfigService).get('BRIDGE_ENABLED')).toBe(false);
  });

  it('GET /inventory/me с валидным токеном: 503 inventory_unavailable', async () => {
    const http = () => request(app.getHttpServer());
    const email = `invcfg-${unique}@example.com`;
    const username = `invcfg${unique}`.slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    const auth = `Bearer ${login.body.accessToken}`;

    const res = await http()
      .get('/inventory/me')
      .set('Authorization', auth)
      .expect(503);
    expect(JSON.stringify(res.body)).toContain('inventory_unavailable');
    await http()
      .get('/inventory/me/privacy')
      .set('Authorization', auth)
      .expect(503);
  });
});
