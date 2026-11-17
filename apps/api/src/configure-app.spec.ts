import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configureApp } from './configure-app';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      isGlobal: true,
      load: [
        () => ({
          WEB_ORIGINS: 'https://twomc.su',
          NODE_ENV: 'test',
          STORAGE_DRIVER: 's3',
        }),
      ],
    }),
  ],
  controllers: [PingController],
})
class TestModule {}

describe('configureApp: CORS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('отдаёт Access-Control-Expose-Headers: Retry-After (только его)', async () => {
    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://twomc.su')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://twomc.su');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toBe('Retry-After');
  });

  it('чужой origin не получает Allow-Origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
