import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from './../src/configure-app';
import { markStaffTwoFactorEnabled } from './helpers/staff-two-factor';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';
import { TwoFactorService } from '../src/modules/auth/two-factor/two-factor.service';

jest.setTimeout(30_000);

/// Шаблоны игровых команд и тексты магазина (0.11, ADR-0189). Свежий код 2FA
/// подменён заглушкой TwoFactorService (принимает только 123456). Спека НЕ
/// запускалась при написании (нет БД в сеансе) — прогонит CI. Требует в БД
/// права `store.delivery.templates.manage` и `store.settings.manage`
/// (синхронизация реестра прав при старте).
describe('Шаблоны команд и тексты магазина (0.11, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let permissions: PermissionService;
  const unique = randomUUID().slice(0, 8);
  const password = 'Sup3rSecretPassw0rd!';
  const GOOD_CODE = '123456';
  const roleSlugs: string[] = [];
  const userIds: string[] = [];
  let productId = '';
  let categoryId = '';

  interface TestUser {
    id: string;
    accessToken: string;
  }
  let owner: TestUser;
  let plain: TestUser;
  let textsEditor: TestUser;

  const http = () => request(app.getHttpServer());
  const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
  const TEMPLATE = 'lp user {username} parent addtemp ares {duration}';

  async function createUser(label: string): Promise<TestUser> {
    const email = `tp-${label}-${unique}@example.com`;
    const username = `tp${label}${unique}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    await http()
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ emailOrUsername: email, password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    return { id: user.id, accessToken: login.body.accessToken };
  }

  async function makeStaff(user: TestUser, slug: string, keys: string[]) {
    roleSlugs.push(slug);
    const role = await prisma.role.create({
      data: {
        name: slug,
        slug,
        displayName: slug,
        priority: 20,
        isSystem: false,
        isAssignable: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await markStaffTwoFactorEnabled(prisma, user.id);
    const records = await prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    await prisma.rolePermission.createMany({
      data: records.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await permissions.invalidateRole(role.id);
    await permissions.invalidateUser(user.id);
  }

  const put = (u: TestUser, body: Record<string, unknown>) =>
    http()
      .put(`/admin/store/delivery-templates/products/${productId}`)
      .set('Authorization', auth(u))
      .send({ template: TEMPLATE, twoFactorCode: GOOD_CODE, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TwoFactorService)
      .useValue({
        available: true,
        verify: (_id: string, code: string) =>
          Promise.resolve(code === GOOD_CODE ? 'totp' : null),
      })
      .compile();
    app = moduleFixture.createNestApplication(APP_CREATE_OPTIONS);
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    permissions = app.get(PermissionService);
    owner = await createUser('owner');
    plain = await createUser('plain');
    textsEditor = await createUser('texts');
    await makeStaff(owner, `e2e-tp-owner-${unique}`, [
      'store.delivery.templates.manage',
      'store.settings.manage',
    ]);
    await makeStaff(textsEditor, `e2e-tp-texts-${unique}`, [
      'store.settings.manage',
    ]);
    const category = await prisma.category.create({
      data: { name: `tp-${unique}`, slug: `tp-${unique}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `Арес ${unique}`,
        slug: `ares-${unique}`,
        type: 'PRIVILEGE',
        categoryId,
        images: [],
        gameCommands: [],
        variants: { create: [{ duration: 'MONTH_1', price: 100 }] },
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.deliveryCommandTemplate.deleteMany({ where: { productId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.siteSetting.deleteMany({
      where: { key: { startsWith: 'store.text.' } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.role.deleteMany({ where: { slug: { in: roleSlugs } } });
    await app.close();
  });

  it('без права шаблон не правится и не читается (403), анониму 401', async () => {
    await put(plain, {}).expect(403);
    await put(textsEditor, {}).expect(403);
    await http()
      .get('/admin/store/delivery-templates')
      .set('Authorization', auth(plain))
      .expect(403);
    await http()
      .post('/admin/store/delivery-templates/preview')
      .set('Authorization', auth(plain))
      .send({ template: TEMPLATE, username: 'Steve', duration: 'WEEK_1' })
      .expect(403);
    await http()
      .put(`/admin/store/delivery-templates/products/${productId}`)
      .send({ template: TEMPLATE, twoFactorCode: GOOD_CODE })
      .expect(401);
  });

  it('без 2FA или с неверным кодом: 403, шаблон не сохранён', async () => {
    await put(owner, { twoFactorCode: '000000' }).expect(403);
    await http()
      .put(`/admin/store/delivery-templates/products/${productId}`)
      .set('Authorization', auth(owner))
      .send({ template: TEMPLATE })
      .expect(400);
    expect(
      await prisma.deliveryCommandTemplate.count({ where: { productId } }),
    ).toBe(0);
  });

  it.each([
    'unban {username}; op {username}',
    'unban {username} && stop',
    'unban {username} | tee x',
    'unban $(id) {username}',
    'unban {nick}',
    'unban {username}\nstop',
  ])('опасный шаблон %j: 400', async (template) => {
    await put(owner, { template }).expect(400);
    expect(
      await prisma.deliveryCommandTemplate.count({ where: { productId } }),
    ).toBe(0);
  });

  it('владелец с 2FA сохраняет шаблон; аудит содержит старое и новое', async () => {
    const first = await put(owner, {}).expect(200);
    expect(first.body.version).toBe(1);
    const second = await put(owner, {
      template: 'give {username} diamond 1',
    }).expect(200);
    expect(second.body.version).toBe(2);
    const logs = await prisma.auditLog.findMany({
      where: {
        actorId: owner.id,
        action: 'store.delivery.template.updated',
        targetId: productId,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    const changes = logs[1].changes as {
      before: { template: string };
      after: { template: string };
    };
    expect(changes.before.template).toBe(TEMPLATE);
    expect(changes.after.template).toBe('give {username} diamond 1');
  });

  it('preview возвращает команду с подставленным ником и срок не из перечня отклоняет', async () => {
    const ok = await http()
      .post('/admin/store/delivery-templates/preview')
      .set('Authorization', auth(owner))
      .send({ template: TEMPLATE, username: 'Steve_1', duration: 'MONTH_1' })
      .expect(201);
    expect(ok.body.command).toBe('lp user Steve_1 parent addtemp ares 30d');
    await http()
      .post('/admin/store/delivery-templates/preview')
      .set('Authorization', auth(owner))
      .send({ template: TEMPLATE, username: 'Steve; op', duration: 'MONTH_1' })
      .expect(400);
    await http()
      .post('/admin/store/delivery-templates/preview')
      .set('Authorization', auth(owner))
      .send({ template: TEMPLATE, username: 'Steve', duration: 'YEAR' })
      .expect(400);
  });

  it('тексты: редактор с правом сохраняет, чужой ключ и без права отклоняются', async () => {
    await http()
      .put('/admin/store/settings')
      .set('Authorization', auth(plain))
      .send({ values: { 'store.text.refund_policy': 'x' } })
      .expect(403);
    await http()
      .put('/admin/store/settings')
      .set('Authorization', auth(textsEditor))
      .send({ values: { 'store.delivery.enabled': 'true' } })
      .expect(400);
    await http()
      .put('/admin/store/settings')
      .set('Authorization', auth(textsEditor))
      .send({ values: { 'store.text.refund_policy': 'Возврат до выдачи' } })
      .expect(200);
    const pub = await http().get('/store/texts').expect(200);
    expect(pub.body['store.text.refund_policy']).toBe('Возврат до выдачи');
    const log = await prisma.auditLog.findFirst({
      where: { actorId: textsEditor.id, action: 'store.settings.updated' },
    });
    expect(log).toBeTruthy();
  });
});
