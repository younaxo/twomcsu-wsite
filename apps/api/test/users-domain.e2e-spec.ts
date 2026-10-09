import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — тот же риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Positions / Departments / Custom Positions / Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);

  let actor: { id: string; accessToken: string };
  let managerRoleId: string;
  let targetUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);

    const email = `users-domain-${unique}@example.com`;
    const username = `usersdom${unique}`.slice(0, 16);
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
    actor = { id: user.id, accessToken: loginRes.body.accessToken };
    targetUserId = user.id;

    const role = await prisma.role.create({
      data: {
        name: `manager-${unique}`,
        slug: `manager-${unique}`,
        displayName: 'Manager',
        priority: 500,
      },
    });
    managerRoleId = role.id;
    const permissionRecords = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            'positions.view',
            'positions.create',
            'positions.edit',
            'positions.delete',
            'positions.assign',
            'departments.view',
            'departments.create',
            'departments.edit',
            'departments.delete',
            'departments.assign',
            'custom_positions.view',
            'custom_positions.create',
            'custom_positions.edit',
            'custom_positions.delete',
            'custom_positions.assign',
            'users.view',
          ],
        },
      },
    });
    await prisma.rolePermission.createMany({
      data: permissionRecords.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await permissions.invalidateUser(user.id);
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { roleId: managerRoleId } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: managerRoleId },
    });
    await prisma.role.deleteMany({ where: { id: managerRoleId } });
    await prisma.auditLog.deleteMany({
      where: { actor: { id: targetUserId } },
    });
    await prisma.user.deleteMany({ where: { id: targetUserId } });
    await app.close();
  });

  it('GET /positions (публичный) возвращает хотя бы default-позицию из seed', async () => {
    const res = await request(app.getHttpServer())
      .get('/positions')
      .expect(200);
    expect(res.body.some((p: { slug: string }) => p.slug === 'default')).toBe(
      true,
    );
  });

  it('позиции: создание, назначение, запрет удаления default', async () => {
    const auth = `Bearer ${actor.accessToken}`;
    const created = await request(app.getHttpServer())
      .post('/positions')
      .set('Authorization', auth)
      .send({
        name: `VIP-${unique}`,
        slug: `vip-${unique}`,
        displayName: 'VIP',
        group: 'donor',
        color: '#ff00ff',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/positions/${created.body.id}/assign`)
      .set('Authorization', auth)
      .send({ userId: targetUserId })
      .expect(201);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
    });
    expect(updatedUser.positionId).toBe(created.body.id);

    const defaultPosition = await prisma.position.findUniqueOrThrow({
      where: { slug: 'default' },
    });
    await request(app.getHttpServer())
      .delete(`/positions/${defaultPosition.id}`)
      .set('Authorization', auth)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/positions/${created.body.id}`)
      .set('Authorization', auth)
      .expect(409); // назначена пользователю — FK violation перехвачен как 409

    // Вернуть пользователя на default перед финальным удалением тестовой позиции.
    await request(app.getHttpServer())
      .post(`/positions/${defaultPosition.id}/assign`)
      .set('Authorization', auth)
      .send({ userId: targetUserId })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/positions/${created.body.id}`)
      .set('Authorization', auth)
      .expect(200);
  });

  it('отделы: создание, назначение пользователю, reorder, снятие', async () => {
    const auth = `Bearer ${actor.accessToken}`;
    const deptA = await request(app.getHttpServer())
      .post('/admin/departments')
      .set('Authorization', auth)
      .send({ name: `Dept A ${unique}`, slug: `dept-a-${unique}` })
      .expect(201);
    const deptB = await request(app.getHttpServer())
      .post('/admin/departments')
      .set('Authorization', auth)
      .send({ name: `Dept B ${unique}`, slug: `dept-b-${unique}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/users/${targetUserId}/departments/${deptA.body.id}`)
      .set('Authorization', auth)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/users/${targetUserId}/departments/${deptB.body.id}`)
      .set('Authorization', auth)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/users/${targetUserId}/departments/order`)
      .set('Authorization', auth)
      .send({ departmentIds: [deptB.body.id, deptA.body.id] })
      .expect(200);

    const memberships = await prisma.userDepartment.findMany({
      where: { userId: targetUserId },
      orderBy: { order: 'asc' },
    });
    expect(memberships.map((m) => m.departmentId)).toEqual([
      deptB.body.id,
      deptA.body.id,
    ]);

    await request(app.getHttpServer())
      .delete(`/admin/users/${targetUserId}/departments/${deptA.body.id}`)
      .set('Authorization', auth)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/departments/${deptA.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/admin/departments/${deptB.body.id}`)
      .set('Authorization', auth)
      .expect(200);
  });

  it('кастомные должности: назначение — 1 на пользователя (замена, не дублирование)', async () => {
    const auth = `Bearer ${actor.accessToken}`;
    const posA = await request(app.getHttpServer())
      .post('/admin/custom-positions')
      .set('Authorization', auth)
      .send({ name: `Custom A ${unique}`, slug: `custom-a-${unique}` })
      .expect(201);
    const posB = await request(app.getHttpServer())
      .post('/admin/custom-positions')
      .set('Authorization', auth)
      .send({ name: `Custom B ${unique}`, slug: `custom-b-${unique}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/users/${targetUserId}/custom-position`)
      .set('Authorization', auth)
      .send({ customPositionId: posA.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/users/${targetUserId}/custom-position`)
      .set('Authorization', auth)
      .send({ customPositionId: posB.body.id })
      .expect(201);

    const assignments = await prisma.userCustomPosition.findMany({
      where: { userId: targetUserId },
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].customPositionId).toBe(posB.body.id);

    await request(app.getHttpServer())
      .delete(`/admin/users/${targetUserId}/custom-position`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/admin/custom-positions/${posA.body.id}`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/admin/custom-positions/${posB.body.id}`)
      .set('Authorization', auth)
      .expect(200);
  });

  it('GET /admin/users поддерживает поиск и пагинацию, GET /admin/users/:id/full отдаёт детали', async () => {
    const auth = `Bearer ${actor.accessToken}`;
    const listRes = await request(app.getHttpServer())
      .get(`/admin/users?q=${unique}&limit=50`)
      .set('Authorization', auth)
      .expect(200);
    expect(
      listRes.body.items.some((u: { id: string }) => u.id === targetUserId),
    ).toBe(true);
    expect(listRes.body.items[0].password).toBeUndefined();

    const fullRes = await request(app.getHttpServer())
      .get(`/admin/users/${targetUserId}/full`)
      .set('Authorization', auth)
      .expect(200);
    expect(fullRes.body.id).toBe(targetUserId);
    expect(
      fullRes.body.roles.some(
        (r: { role: { id: string } }) => r.role.id === managerRoleId,
      ),
    ).toBe(true);
  });
});
