import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('CORS (ADR-0104): свой origin — разрешён с credentials, чужой — без ACAO', async () => {
    const own =
      process.env.WEB_ORIGINS?.split(',')[0]?.trim() ||
      process.env.WEB_ORIGIN ||
      'http://localhost:3000';
    const allowed = await request(app.getHttpServer())
      .options('/auth/me')
      .set('Origin', own)
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe(own);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    for (const evil of [
      'https://evil.example',
      'null',
      `${own}.evil.example`,
    ]) {
      const denied = await request(app.getHttpServer())
        .options('/auth/me')
        .set('Origin', evil)
        .set('Access-Control-Request-Method', 'GET');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
});
