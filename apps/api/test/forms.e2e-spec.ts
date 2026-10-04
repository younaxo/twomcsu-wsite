import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PermissionService } from '../src/modules/roles/permission.service';

// См. auth.e2e-spec.ts — риск конкуренции за ресурсы под полным сьютом.
jest.setTimeout(20_000);

describe('Forms (e2e)', () => {
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
    const email = `forms-${label}-${unique}@example.com`;
    const username = `forms${label}${unique}`
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
  let helper: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  const createdFormSlugs: string[] = [];

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
    helper = await createUser('helper');
    alice = await createUser('alice');
    bob = await createUser('bob');

    const adminRole = await createRole(`forms-admin-${unique}`, 20);
    await grantRole(admin.id, adminRole.id);
    await grantPermissions(adminRole.id, [
      'forms.view',
      'forms.create',
      'forms.edit',
      'forms.delete',
      'forms.publish',
      'forms.close',
      'forms.duplicate',
      'forms.responses',
      'forms.invites',
      'forms.stats',
      'forms.view.helper',
    ]);

    const helperRole = await createRole(`forms-helper-${unique}`, 10);
    await grantRole(helper.id, helperRole.id);
    await grantPermissions(helperRole.id, ['forms.view.helper']);
  }, 30_000);

  afterAll(async () => {
    if (admin && helper && alice && bob) {
      await prisma.formResponse.deleteMany({
        where: { form: { slug: { startsWith: `e2e-${unique}` } } },
      });
      await prisma.formInvite.deleteMany({
        where: { form: { slug: { startsWith: `e2e-${unique}` } } },
      });
      await prisma.form.deleteMany({
        where: { slug: { startsWith: `e2e-${unique}` } },
      });
      await prisma.news.deleteMany({
        where: { slug: { startsWith: `e2e-forms-${unique}` } },
      });
      await prisma.topic.deleteMany({
        where: { slug: { startsWith: `e2e-forms-${unique}` } },
      });
      await prisma.server.deleteMany({
        where: { slug: { startsWith: `e2e-forms-${unique}` } },
      });
      await prisma.friendship.deleteMany({
        where: { OR: [{ requesterId: alice.id }, { requesterId: bob.id }] },
      });
      await prisma.userRole.deleteMany({
        where: { role: { slug: { in: cleanupRoleSlugs } } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { slug: { in: cleanupRoleSlugs } } },
      });
      await prisma.role.deleteMany({
        where: { slug: { in: cleanupRoleSlugs } },
      });
      await prisma.user.deleteMany({
        where: {
          email: { in: [admin.email, helper.email, alice.email, bob.email] },
        },
      });
    }
    await app.close();
  }, 15_000);

  const auth = (user: TestUser) => `Bearer ${user.accessToken}`;

  function slugFor(name: string): string {
    const slug = `e2e-${unique}-${name}`;
    createdFormSlugs.push(slug);
    return slug;
  }

  it('admin: создание формы требует forms.create', async () => {
    const slug = slugFor('basic');
    await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(alice))
      .send({
        slug,
        title: 'Базовая форма',
        fields: [{ type: 'TEXT', label: 'Имя', isRequired: true }],
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Базовая форма',
        description: 'Проверка базового сценария',
        fields: [
          {
            type: 'TEXT',
            label: 'Имя',
            isRequired: true,
            minLength: 2,
            maxLength: 50,
          },
          {
            type: 'RADIO',
            label: 'Класс',
            options: ['Воин', 'Маг'],
            isRequired: true,
          },
          {
            type: 'CHECKBOX',
            label: 'Интересы',
            options: ['PVP', 'PVE', 'Торговля'],
          },
          { type: 'NUMBER', label: 'Возраст', minValue: 10, maxValue: 99 },
          {
            type: 'AGREEMENT_CHECKLIST',
            label: 'Согласие с правилами',
            isRequired: true,
          },
        ],
      })
      .expect(201);

    expect(created.body.status).toBe('DRAFT');
    expect(created.body.fields).toHaveLength(5);
  });

  it('admin: RADIO/CHECKBOX/SELECT без options отклоняются с 400', async () => {
    const slug = slugFor('no-options');
    await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Без опций',
        fields: [{ type: 'RADIO', label: 'Выбор' }],
      })
      .expect(400);
  });

  let formId: string;
  let mainSlug: string;

  it('черновик недоступен публично (404), виден админу по id', async () => {
    mainSlug = slugFor('main');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug: mainSlug,
        title: 'Основная форма',
        onePerUser: true,
        requiresCaptcha: false,
        fields: [
          { type: 'TEXT', label: 'Имя', isRequired: true },
          {
            type: 'RADIO',
            label: 'Класс',
            options: ['Воин', 'Маг'],
            isRequired: true,
          },
          {
            type: 'CHECKBOX',
            label: 'Интересы',
            options: ['PVP', 'PVE', 'Торговля'],
          },
          { type: 'AGREEMENT_CHECKLIST', label: 'Согласие', isRequired: true },
        ],
      })
      .expect(201);
    formId = created.body.id;

    await request(app.getHttpServer()).get(`/forms/${mainSlug}`).expect(404);

    await request(app.getHttpServer())
      .get(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('публикация делает форму видимой публично и в /forms', async () => {
    const published = await request(app.getHttpServer())
      .post(`/admin/forms/${formId}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);
    expect(published.body.status).toBe('PUBLISHED');

    const got = await request(app.getHttpServer())
      .get(`/forms/${mainSlug}`)
      .expect(200);
    expect(got.body.id).toBe(formId);
    expect(got.body.fields).toHaveLength(4);

    const list = await request(app.getHttpServer()).get('/forms').expect(200);
    expect(list.body.some((f: { id: string }) => f.id === formId)).toBe(true);
  });

  let textFieldId: string;
  let radioFieldId: string;
  let checkboxFieldId: string;
  let agreementFieldId: string;

  it('подготовка id полей формы', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    const fields = detail.body.fields as Array<{ id: string; type: string }>;
    textFieldId = fields.find((f) => f.type === 'TEXT')!.id;
    radioFieldId = fields.find((f) => f.type === 'RADIO')!.id;
    checkboxFieldId = fields.find((f) => f.type === 'CHECKBOX')!.id;
    agreementFieldId = fields.find((f) => f.type === 'AGREEMENT_CHECKLIST')!.id;
    expect(textFieldId).toBeDefined();
  });

  it('submit: пропуск обязательного поля даёт 400', async () => {
    await request(app.getHttpServer())
      .post(`/forms/${mainSlug}/responses`)
      .send({
        answers: [
          { fieldId: radioFieldId, value: 'Воин' },
          { fieldId: agreementFieldId, value: true },
        ],
      })
      .expect(400);
  });

  it('submit: недопустимое значение RADIO даёт 400', async () => {
    await request(app.getHttpServer())
      .post(`/forms/${mainSlug}/responses`)
      .send({
        answers: [
          { fieldId: textFieldId, value: 'Гость' },
          { fieldId: radioFieldId, value: 'Лучник' },
          { fieldId: agreementFieldId, value: true },
        ],
      })
      .expect(400);
  });

  it('submit: анонимная отправка проходит, увеличивает responsesCount', async () => {
    const res = await request(app.getHttpServer())
      .post(`/forms/${mainSlug}/responses`)
      .send({
        answers: [
          { fieldId: textFieldId, value: 'Гость' },
          { fieldId: radioFieldId, value: 'Воин' },
          { fieldId: checkboxFieldId, value: ['PVP', 'PVE'] },
          { fieldId: agreementFieldId, value: true },
        ],
      })
      .expect(201);
    expect(res.body.isComplete).toBe(true);
    expect(res.body.isAnonymous).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(detail.body.responsesCount).toBe(1);
  });

  it('submit: onePerUser блокирует повторную отправку тем же пользователем', async () => {
    const payload = {
      answers: [
        { fieldId: textFieldId, value: 'Алиса' },
        { fieldId: radioFieldId, value: 'Маг' },
        { fieldId: agreementFieldId, value: true },
      ],
    };
    await request(app.getHttpServer())
      .post(`/forms/${mainSlug}/responses`)
      .set('Authorization', auth(alice))
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/forms/${mainSlug}/responses`)
      .set('Authorization', auth(alice))
      .send(payload)
      .expect(403);
  });

  it('submit: достигнут maxResponses — дальнейшие отправки запрещены', async () => {
    const slug = slugFor('capped');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Форма с лимитом ответов',
        maxResponses: 1,
        onePerUser: false,
        requiresCaptcha: false,
        fields: [{ type: 'TEXT', label: 'Имя', isRequired: true }],
      })
      .expect(201);
    const cappedFieldId = created.body.fields[0].id;
    await request(app.getHttpServer())
      .post(`/admin/forms/${created.body.id}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/forms/${slug}/responses`)
      .set('Authorization', auth(alice))
      .send({ answers: [{ fieldId: cappedFieldId, value: 'Алиса' }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/forms/${slug}/responses`)
      .set('Authorization', auth(bob))
      .send({ answers: [{ fieldId: cappedFieldId, value: 'Боб' }] })
      .expect(403);
  });

  it('draft: сохранение черновика и его появление в /forms/my/responses', async () => {
    const slug = slugFor('draft-form');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Форма с черновиком',
        requiresCaptcha: false,
        onePerUser: false,
        fields: [
          { type: 'TEXT', label: 'Никнейм', isRequired: true },
          { type: 'TEXTAREA', label: 'О себе' },
        ],
      })
      .expect(201);
    const draftFormId = created.body.id;
    const nickFieldId = created.body.fields.find(
      (f: { type: string }) => f.type === 'TEXT',
    ).id;

    await request(app.getHttpServer())
      .post(`/admin/forms/${draftFormId}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post(`/forms/${slug}/responses/save-draft`)
      .set('Authorization', auth(bob))
      .send({
        answers: [{ fieldId: nickFieldId, value: 'Black_Bob' }],
        currentStep: 0,
      })
      .expect(201);
    expect(draft.body.isComplete).toBe(false);

    const myResponses = await request(app.getHttpServer())
      .get('/forms/my/responses')
      .set('Authorization', auth(bob))
      .expect(200);
    expect(
      myResponses.body.some(
        (r: { id: string; isComplete: boolean }) =>
          r.id === draft.body.id && r.isComplete === false,
      ),
    ).toBe(true);
  });

  it('видимость HELPER_ONLY: скрыта для alice, видна helper и admin', async () => {
    const slug = slugFor('helper-only');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Форма для хелперов',
        visibility: 'HELPER_ONLY',
        requiresCaptcha: false,
        fields: [{ type: 'TEXT', label: 'Комментарий' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/forms/${created.body.id}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);

    await request(app.getHttpServer())
      .get(`/forms/${slug}`)
      .set('Authorization', auth(alice))
      .expect(404);
    await request(app.getHttpServer()).get(`/forms/${slug}`).expect(404);

    await request(app.getHttpServer())
      .get(`/forms/${slug}`)
      .set('Authorization', auth(helper))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/forms/${slug}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const publicList = await request(app.getHttpServer())
      .get('/forms')
      .set('Authorization', auth(helper))
      .expect(200);
    expect(publicList.body.some((f: { slug: string }) => f.slug === slug)).toBe(
      true,
    );
  });

  it('INVITE_ONLY: доступ только по коду приглашения, usedCount растёт, после исчерпания — 403', async () => {
    const slug = slugFor('invite-only');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Форма по приглашению',
        visibility: 'INVITE_ONLY',
        requiresCaptcha: false,
        fields: [{ type: 'TEXT', label: 'Имя', isRequired: true }],
      })
      .expect(201);
    const inviteFormId = created.body.id;
    const nameFieldId = created.body.fields[0].id;

    await request(app.getHttpServer())
      .post(`/admin/forms/${inviteFormId}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);

    await request(app.getHttpServer()).get(`/forms/${slug}`).expect(404);

    const invite = await request(app.getHttpServer())
      .post(`/admin/forms/${inviteFormId}/invites`)
      .set('Authorization', auth(admin))
      .send({ maxUses: 1 })
      .expect(201);
    const code = invite.body.code;

    const byInvite = await request(app.getHttpServer())
      .get(`/forms/invite/${code}`)
      .expect(200);
    expect(byInvite.body.id).toBe(inviteFormId);

    await request(app.getHttpServer())
      .post(`/forms/${slug}/responses`)
      .send({ answers: [{ fieldId: nameFieldId, value: 'Гость' }] })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/forms/${slug}/responses`)
      .send({
        answers: [{ fieldId: nameFieldId, value: 'Гость' }],
        inviteCode: code,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/forms/${slug}/responses`)
      .send({
        answers: [{ fieldId: nameFieldId, value: 'Ещё гость' }],
        inviteCode: code,
      })
      .expect(403);

    const invitesList = await request(app.getHttpServer())
      .get(`/admin/forms/${inviteFormId}/invites`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(
      invitesList.body.find((i: { code: string }) => i.code === code).usedCount,
    ).toBe(1);

    await request(app.getHttpServer())
      .delete(`/admin/forms/${inviteFormId}/invites/${code}`)
      .set('Authorization', auth(admin))
      .expect(200);
  });

  it('NEWS_REFERENCE/TOPIC_REFERENCE/SERVER_SELECTOR/FRIENDS_SELECTOR: реальная referential-валидация', async () => {
    const news = await prisma.news.create({
      data: {
        slug: `e2e-forms-${unique}-news`,
        title: 'Патч для формы',
        content: 'Контент',
        category: 'PATCH_NOTES',
        status: 'PUBLISHED',
        authorId: admin.id,
        publishedAt: new Date(),
      },
    });
    const draftNews = await prisma.news.create({
      data: {
        slug: `e2e-forms-${unique}-news-draft`,
        title: 'Черновик новости',
        content: 'Контент',
        category: 'OTHER',
        status: 'DRAFT',
        authorId: admin.id,
      },
    });
    const topic = await prisma.topic.create({
      data: {
        slug: `e2e-forms-${unique}-topic`,
        title: 'Правила сервера',
        category: 'RULES',
        content: 'Текст',
        isActive: true,
        createdBy: admin.id,
      },
    });

    await prisma.friendship.create({
      data: {
        requesterId: alice.id,
        addresseeId: bob.id,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    const activeServer = await prisma.server.create({
      data: {
        name: 'E2E Форм-сервер',
        slug: `e2e-forms-${unique}-server`,
        address: '127.0.0.1',
        type: 'SURVIVAL',
        isActive: true,
      },
    });
    const inactiveServer = await prisma.server.create({
      data: {
        name: 'E2E Выключенный сервер',
        slug: `e2e-forms-${unique}-server-inactive`,
        address: '127.0.0.1',
        type: 'SURVIVAL',
        isActive: false,
      },
    });

    const slug = slugFor('refs');
    const created = await request(app.getHttpServer())
      .post('/admin/forms')
      .set('Authorization', auth(admin))
      .send({
        slug,
        title: 'Форма со ссылками',
        requiresCaptcha: false,
        onePerUser: false,
        fields: [
          { type: 'NEWS_REFERENCE', label: 'Новость' },
          { type: 'TOPIC_REFERENCE', label: 'Тема' },
          { type: 'SERVER_SELECTOR', label: 'Сервер' },
          { type: 'FRIENDS_SELECTOR', label: 'Друг' },
        ],
      })
      .expect(201);
    const refFormId = created.body.id;
    const newsFieldId = created.body.fields.find(
      (f: { type: string }) => f.type === 'NEWS_REFERENCE',
    ).id;
    const topicFieldId = created.body.fields.find(
      (f: { type: string }) => f.type === 'TOPIC_REFERENCE',
    ).id;
    const serverFieldId = created.body.fields.find(
      (f: { type: string }) => f.type === 'SERVER_SELECTOR',
    ).id;
    const friendFieldId = created.body.fields.find(
      (f: { type: string }) => f.type === 'FRIENDS_SELECTOR',
    ).id;

    await request(app.getHttpServer())
      .post(`/admin/forms/${refFormId}/publish`)
      .set('Authorization', auth(admin))
      .expect(201);

    const refSlug = slug;

    // Несуществующая/неопубликованная новость отклоняется
    await request(app.getHttpServer())
      .post(`/forms/${refSlug}/responses`)
      .set('Authorization', auth(alice))
      .send({ answers: [{ fieldId: newsFieldId, value: draftNews.id }] })
      .expect(400);

    // Пользователь, не являющийся другом, отклоняется FRIENDS_SELECTOR
    await request(app.getHttpServer())
      .post(`/forms/${refSlug}/responses`)
      .set('Authorization', auth(alice))
      .send({ answers: [{ fieldId: friendFieldId, value: admin.id }] })
      .expect(400);

    // Выключенный сервер отклоняется SERVER_SELECTOR
    await request(app.getHttpServer())
      .post(`/forms/${refSlug}/responses`)
      .set('Authorization', auth(alice))
      .send({ answers: [{ fieldId: serverFieldId, value: inactiveServer.id }] })
      .expect(400);

    // Валидные ссылки проходят
    const ok = await request(app.getHttpServer())
      .post(`/forms/${refSlug}/responses`)
      .set('Authorization', auth(alice))
      .send({
        answers: [
          { fieldId: newsFieldId, value: news.id },
          { fieldId: topicFieldId, value: topic.id },
          { fieldId: serverFieldId, value: activeServer.id },
          { fieldId: friendFieldId, value: bob.id },
        ],
      })
      .expect(201);
    expect(ok.body.isComplete).toBe(true);
  });

  it('admin: статистика и список ответов, удаление ответа уменьшает responsesCount', async () => {
    const stats = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}/stats`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(stats.body.totalResponses).toBe(2);
    expect(
      stats.body.fieldStats.find(
        (f: { fieldId: string }) => f.fieldId === radioFieldId,
      ).breakdown,
    ).toMatchObject({ Воин: 1, Маг: 1 });

    const responsesList = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}/responses`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(responsesList.body.total).toBe(2);
    const responseId = responsesList.body.items[0].id;

    await request(app.getHttpServer())
      .get(`/admin/forms/${formId}/responses/${responseId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/forms/${formId}/responses/${responseId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(afterDelete.body.responsesCount).toBe(1);
  });

  it('admin: close/duplicate/archive меняют статус формы', async () => {
    const closed = await request(app.getHttpServer())
      .post(`/admin/forms/${formId}/close`)
      .set('Authorization', auth(admin))
      .expect(201);
    expect(closed.body.status).toBe('CLOSED');

    await request(app.getHttpServer()).get(`/forms/${mainSlug}`).expect(404);

    const duplicated = await request(app.getHttpServer())
      .post(`/admin/forms/${formId}/duplicate`)
      .set('Authorization', auth(admin))
      .expect(201);
    expect(duplicated.body.slug).toBe(`${mainSlug}-copy`);
    expect(duplicated.body.fields).toHaveLength(4);
    expect(duplicated.body.status).toBe('DRAFT');
    createdFormSlugs.push(duplicated.body.slug);

    await request(app.getHttpServer())
      .delete(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);

    const afterArchive = await request(app.getHttpServer())
      .get(`/admin/forms/${formId}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(afterArchive.body.status).toBe('ARCHIVED');
  });

  it('admin: список форм с фильтрами по статусу', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/forms')
      .set('Authorization', auth(admin))
      .query({ status: 'ARCHIVED' })
      .expect(200);
    expect(list.body.items.some((f: { id: string }) => f.id === formId)).toBe(
      true,
    );
  });
});
