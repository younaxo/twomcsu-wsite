import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { NotificationsGateway } from '../src/modules/notifications/notifications.gateway';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(30_000);

/// ADR-0074: действия с уведомлениями и событие изменения для мгновенного
/// обновления счётчика во всех вкладках.
describe('Notification actions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let changed: jest.SpyInstance;
  const unique = randomUUID().slice(0, 6);
  const password = 'Sup3rSecretPassw0rd!';
  const ids: string[] = [];

  async function createUser(label: string) {
    const email = `na-${label}-${unique}@example.com`;
    const username = `na${label}${unique}`.slice(0, 16);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: username, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(user.id);
    return { id: user.id, auth: `Bearer ${login.body.accessToken}` };
  }

  async function seed(userId: string, fromUserId: string, read: boolean[]) {
    for (const [i, isRead] of read.entries()) {
      await prisma.notification.create({
        data: {
          userId,
          fromUserId,
          type: 'SYSTEM',
          title: `Уведомление ${i}`,
          isRead,
          readAt: isRead ? new Date() : null,
        },
      });
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    changed = jest.spyOn(app.get(NotificationsGateway), 'emitChanged');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('прочитано/непрочитано, удалить прочитанные, очистить; событие со счётчиком', async () => {
    const owner = await createUser('own');
    const sender = await createUser('snd');
    await seed(owner.id, sender.id, [false, false, true]);
    const http = () => request(app.getHttpServer());

    const all = await http()
      .get('/notifications?unreadOnly=false')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(all.body.total).toBe(3);
    // Отправитель — только публичная часть.
    expect(all.body.items[0].fromUser).toEqual({
      id: sender.id,
      username: expect.any(String),
      avatar: null,
    });
    const unread = await http()
      .get('/notifications?unreadOnly=true')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(unread.body.total).toBe(2);

    const target = unread.body.items[0].id as string;
    await http()
      .patch(`/notifications/${target}/read`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(changed).toHaveBeenLastCalledWith(owner.id, 1);
    const back = await http()
      .patch(`/notifications/${target}/unread`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(back.body).toMatchObject({ isRead: false, readAt: null });
    expect(changed).toHaveBeenLastCalledWith(owner.id, 2);

    const removedRead = await http()
      .delete('/notifications/read')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(removedRead.body.count).toBe(1);
    const count = await http()
      .get('/notifications/unread-count')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(count.body.count).toBe(2);

    // Чужое уведомление не трогается.
    await http()
      .patch(`/notifications/${target}/unread`)
      .set('Authorization', sender.auth)
      .expect(404);
    await http()
      .delete(`/notifications/${target}`)
      .set('Authorization', sender.auth)
      .expect(404);

    const cleared = await http()
      .delete('/notifications')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(cleared.body.count).toBe(2);
    expect(changed).toHaveBeenLastCalledWith(owner.id, 0);
    const empty = await http()
      .get('/notifications')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(empty.body.total).toBe(0);
  });

  it('без входа — 401', async () => {
    await request(app.getHttpServer()).delete('/notifications').expect(401);
  });
});
