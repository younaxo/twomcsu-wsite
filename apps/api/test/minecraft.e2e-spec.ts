import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AddressInfo, Server as NetServer, Socket, createServer } from 'net';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

// Независимая от src/modules/minecraft/slp реализация VarInt-кодирования —
// намеренно продублирована, чтобы фейковый сервер в тесте проверял код
// клиента против реального формата протокола (wiki.vg/Server_List_Ping),
// а не "соглашался сам с собой" при импорте той же функции.
function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let temp = v & 0b0111_1111;
    v >>>= 7;
    if (v !== 0) temp |= 0b1000_0000;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function decodeVarInt(
  buffer: Buffer,
  offset: number,
): { value: number; bytesRead: number } | null {
  let result = 0;
  let shift = 0;
  let position = offset;
  for (let i = 0; i < 5; i += 1) {
    if (position >= buffer.length) return null;
    const byte = buffer[position];
    position += 1;
    result |= (byte & 0b0111_1111) << shift;
    if ((byte & 0b1000_0000) === 0) {
      return { value: result >>> 0, bytesRead: position - offset };
    }
    shift += 7;
  }
  throw new Error('VarInt too long');
}

function encodeVarIntString(value: string): Buffer {
  const content = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarInt(content.length), content]);
}

/// Фейковый Minecraft-сервер, реально говорящий Server List Ping
/// протоколом: читает handshake + status request, отвечает JSON-статусом,
/// затем эхо-отвечает на ping (pong) для измерения задержки клиентом.
function createFakeMinecraftServer(
  statusJson: object,
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: NetServer = createServer((socket: Socket) => {
      let buffer = Buffer.alloc(0);
      let respondedStatus = false;
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
          const lengthResult = decodeVarInt(buffer, 0);
          if (!lengthResult) return;
          const total = lengthResult.bytesRead + lengthResult.value;
          if (buffer.length < total) return;
          const packet = buffer.subarray(lengthResult.bytesRead, total);
          buffer = buffer.subarray(total);

          const idResult = decodeVarInt(packet, 0);
          if (!idResult) continue;
          const packetId = idResult.value;

          if (
            !respondedStatus &&
            packetId === 0x00 &&
            packet.length > idResult.bytesRead
          ) {
            // Это handshake (есть дополнительные поля после id) — игнорируем.
            continue;
          }
          if (!respondedStatus && packetId === 0x00) {
            // Status Request — тело пустое.
            respondedStatus = true;
            const jsonPayload = encodeVarIntString(JSON.stringify(statusJson));
            const inner = Buffer.concat([encodeVarInt(0x00), jsonPayload]);
            socket.write(Buffer.concat([encodeVarInt(inner.length), inner]));
            continue;
          }
          if (packetId === 0x01) {
            // Ping — эхо той же длины тела (8 байт long).
            const body = packet.subarray(idResult.bytesRead);
            const inner = Buffer.concat([encodeVarInt(0x01), body]);
            socket.write(Buffer.concat([encodeVarInt(inner.length), inner]));
          }
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('Minecraft servers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const cleanupRoleSlugs: string[] = [];

  interface TestUser {
    id: string;
    accessToken: string;
    username: string;
    email: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const email = `mc-${label}-${unique}@example.com`;
    const username = `mc${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const password = 'Sup3rSecretPassw0rd!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return {
      id: user.id,
      accessToken: loginRes.body.accessToken,
      username,
      email,
    };
  }

  async function createRole(slug: string, priority: number) {
    cleanupRoleSlugs.push(slug);
    return prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority,
        isSystem: false,
        isAssignable: true,
      },
    });
  }

  async function grantRole(userId: string, roleId: string) {
    await prisma.userRole.create({ data: { userId, roleId } });
    await permissions.invalidateUser(userId);
  }

  async function grantPermissions(roleId: string, keys: string[]) {
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId, permissionId: p.id })),
    });
    await permissions.invalidateRole(roleId);
  }

  let admin: TestUser;
  let alice: TestUser;
  let fakeServer: { port: number; close: () => Promise<void> };
  let closedPort: number;
  let categoryId: string;

  const serverSlug = `e2e-${unique}-online`;
  const offlineServerSlug = `e2e-${unique}-offline`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    admin = await createUser('admin');
    alice = await createUser('alice');

    const adminRole = await createRole(`mc-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'server_categories.view',
      'server_categories.create',
      'server_categories.edit',
      'server_categories.delete',
      'servers.view',
      'servers.create',
      'servers.edit',
      'servers.delete',
      'servers.logs',
    ]);

    fakeServer = await createFakeMinecraftServer({
      description: { text: `E2E Survival ${unique}` },
      players: {
        online: 7,
        max: 100,
        sample: [{ name: 'Steve', id: '00000000-0000-0000-0000-000000000001' }],
      },
      version: { name: '1.20.4', protocol: 765 },
    });

    // Открываем и сразу закрываем сокет, чтобы получить гарантированно
    // свободный (на момент проверки статуса) порт без listener'а — реальная
    // "недоступность", не симуляция через отмену/таймаут.
    closedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const port = (probe.address() as AddressInfo).port;
        probe.close(() => resolve(port));
      });
    });
  }, 30_000);

  afterAll(async () => {
    await fakeServer.close();
    await prisma.serverStatusLog.deleteMany({
      where: { server: { slug: { contains: unique } } },
    });
    await prisma.server.deleteMany({ where: { slug: { contains: unique } } });
    await prisma.serverCategory.deleteMany({
      where: { slug: { contains: unique } },
    });
    await prisma.userRole.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.rolePermission.deleteMany({
      where: { role: { slug: { in: cleanupRoleSlugs } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: cleanupRoleSlugs } } });
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: [admin.email, alice.email] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [admin.email, alice.email] } },
    });
    await app.close();
  }, 20_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  it('категории серверов: создание требует permission, публичный список отражает', async () => {
    await request(app.getHttpServer())
      .post('/admin/server-categories')
      .set('Authorization', auth(alice))
      .send({ name: 'E2E категория', slug: `e2e-${unique}-cat` })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/admin/server-categories')
      .set('Authorization', auth(admin))
      .send({ name: 'E2E категория', slug: `e2e-${unique}-cat` })
      .expect(201);
    categoryId = created.body.id;

    const list = await request(app.getHttpServer())
      .get('/server-categories')
      .expect(200);
    expect(list.body.some((c: { id: string }) => c.id === categoryId)).toBe(
      true,
    );
  });

  let serverId: string;
  let offlineServerId: string;

  it('серверы: создание (online и offline-адрес), публичный список/деталь', async () => {
    const online = await request(app.getHttpServer())
      .post('/admin/servers')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E Survival',
        slug: serverSlug,
        address: '127.0.0.1',
        port: fakeServer.port,
        type: 'SURVIVAL',
        categoryId,
      })
      .expect(201);
    serverId = online.body.id;

    const offline = await request(app.getHttpServer())
      .post('/admin/servers')
      .set('Authorization', auth(admin))
      .send({
        name: 'E2E Offline',
        slug: offlineServerSlug,
        address: '127.0.0.1',
        port: closedPort,
        type: 'SURVIVAL',
      })
      .expect(201);
    offlineServerId = offline.body.id;

    const list = await request(app.getHttpServer()).get('/servers').expect(200);
    expect(list.body.some((s: { id: string }) => s.id === serverId)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/servers/${serverSlug}`)
      .expect(200);
    expect(detail.body.id).toBe(serverId);
  });

  it('статус: реальный SLP-пинг отдаёт online с данными сервера, пишет ServerStatusLog', async () => {
    const status = await request(app.getHttpServer())
      .get(`/servers/${serverSlug}/status`)
      .expect(200);
    expect(status.body.online).toBe(true);
    expect(status.body.playerCount).toBe(7);
    expect(status.body.maxPlayers).toBe(100);
    expect(status.body.version).toBe('1.20.4');
    expect(status.body.ping).toBeGreaterThanOrEqual(0);

    const logs = await prisma.serverStatusLog.findMany({ where: { serverId } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].players).toContain('Steve');
  });

  it('статус: недоступный адрес отдаёт online:false, не падает с ошибкой', async () => {
    const status = await request(app.getHttpServer())
      .get(`/servers/${offlineServerSlug}/status`)
      .expect(200);
    expect(status.body.online).toBe(false);
    expect(status.body.playerCount).toBe(0);
  });

  it('players: отдаёт реальный sample-список игроков с сервера', async () => {
    const players = await request(app.getHttpServer())
      .get(`/servers/${serverSlug}/players`)
      .expect(200);
    expect(players.body).toContain('Steve');
  });

  it('history: отражает ранее записанный лог статуса', async () => {
    const history = await request(app.getHttpServer())
      .get(`/servers/${serverSlug}/history`)
      .expect(200);
    expect(history.body.length).toBeGreaterThan(0);
    expect(history.body[0].online).toBe(true);
  });

  it('overview: агрегирует online/offline сервера реальным параллельным опросом', async () => {
    const overview = await request(app.getHttpServer())
      .get('/servers/overview')
      .expect(200);
    const ids = overview.body.servers.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([serverId, offlineServerId]));
    expect(overview.body.onlineServers).toBeGreaterThanOrEqual(1);
    expect(overview.body.totalPlayers).toBeGreaterThanOrEqual(7);
  });

  it('widget: HTML-фрагмент со статусом конкретного сервера', async () => {
    const widget = await request(app.getHttpServer())
      .get('/servers/widget')
      .query({ slug: serverSlug })
      .expect(200);
    expect(widget.text).toContain('E2E Survival');
    expect(widget.text).toContain('online');
  });

  it('admin: история статуса пагинирована, обновление и удаление сервера', async () => {
    const logs = await request(app.getHttpServer())
      .get(`/admin/servers/${serverId}/logs`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(logs.body.total).toBeGreaterThan(0);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/servers/${serverId}`)
      .set('Authorization', auth(admin))
      .send({ name: 'E2E Survival (обновлён)' })
      .expect(200);
    expect(updated.body.name).toBe('E2E Survival (обновлён)');

    await request(app.getHttpServer())
      .delete(`/admin/servers/${offlineServerId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('категории серверов: нельзя удалить категорию, в которой есть сервер', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/server-categories/${categoryId}`)
      .set('Authorization', auth(admin))
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/admin/servers/${serverId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/server-categories/${categoryId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });
});
