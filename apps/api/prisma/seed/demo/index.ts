import { PrismaClient } from '@prisma/client';
import {
  DEMO_ACHIEVEMENTS,
  DEMO_CATEGORIES,
  DEMO_FORMS,
  DEMO_NEWS,
  DEMO_PUNISHMENTS,
  DEMO_SERVER_CATEGORY,
  DEMO_SERVERS,
  DEMO_SETTINGS,
  DEMO_VOTE_SITE,
  buildDemoProducts,
} from './data';
import { assertDemoSeedAllowed } from './guard';

const DAY = 86_400_000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

/// Dev-only демо-данные. Запуск: `pnpm --filter api db:seed:demo`
/// (NODE_ENV=development, SEED_DEMO=1, локальная БД). Идемпотентно.
async function main(): Promise<void> {
  assertDemoSeedAllowed(process.env);
  const prisma = new PrismaClient();
  try {
    const author = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!author) {
      throw new Error(
        'Нет ни одного пользователя: сначала выполните обычный `db:seed` с bootstrap-аккаунтами.',
      );
    }

    const categoryIds = new Map<string, string>();
    for (const c of DEMO_CATEGORIES) {
      const row = await prisma.category.upsert({
        where: { slug: c.slug },
        create: { ...c },
        update: { name: c.name, order: c.order },
      });
      categoryIds.set(c.slug, row.id);
    }

    const products = buildDemoProducts();
    for (const p of products) {
      const data = {
        name: p.name,
        description: p.description,
        type: p.type,
        categoryId: categoryIds.get(p.categorySlug)!,
        order: p.order,
        gameCommands: p.gameCommands,
        isFeatured: p.isFeatured ?? false,
        maxPerPurchase: p.maxPerPurchase ?? null,
        currencyType: p.currencyAmount ? ('RUBIES' as const) : null,
        currencyAmount: p.currencyAmount ?? null,
      };
      const product = await prisma.product.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, ...data },
        update: data,
      });
      for (const [i, v] of p.variants.entries()) {
        await prisma.productVariant.upsert({
          where: {
            productId_duration: { productId: product.id, duration: v.duration },
          },
          create: {
            productId: product.id,
            duration: v.duration,
            price: v.price,
            order: i,
          },
          update: { price: v.price, order: i },
        });
      }
    }

    for (const n of DEMO_NEWS) {
      const data = {
        title: n.title,
        excerpt: n.excerpt,
        content: n.content,
        category: n.category,
        status: 'PUBLISHED' as const,
        publishedAt: daysAgo(n.daysAgo),
        isPinned: n.isPinned ?? false,
      };
      await prisma.news.upsert({
        where: { slug: n.slug },
        create: { slug: n.slug, authorId: author.id, ...data },
        update: data,
      });
    }

    for (const f of DEMO_FORMS) {
      const form = await prisma.form.upsert({
        where: { slug: f.slug },
        create: {
          slug: f.slug,
          title: f.title,
          description: f.description,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          createdById: author.id,
          requiresCaptcha: false,
        },
        update: {
          title: f.title,
          description: f.description,
          status: 'PUBLISHED',
        },
      });
      let fields = await prisma.formField.findMany({
        where: { formId: form.id },
        orderBy: { order: 'asc' },
      });
      if (fields.length === 0) {
        for (const [order, fld] of f.fields.entries()) {
          await prisma.formField.create({
            data: {
              formId: form.id,
              type: fld.type,
              label: fld.label,
              isRequired: fld.isRequired,
              options: fld.options,
              order,
            },
          });
        }
        fields = await prisma.formField.findMany({
          where: { formId: form.id },
          orderBy: { order: 'asc' },
        });
      }
      let response = await prisma.formResponse.findFirst({
        where: { formId: form.id, metadata: { path: ['demo'], equals: true } },
      });
      if (!response) {
        response = await prisma.formResponse.create({
          data: {
            formId: form.id,
            isAnonymous: true,
            isComplete: true,
            completedAt: new Date(),
            metadata: { demo: true },
          },
        });
        await prisma.form.update({
          where: { id: form.id },
          data: { responsesCount: { increment: 1 } },
        });
      }
      for (const [i, field] of fields.entries()) {
        const value = f.sampleAnswers[i];
        const answer =
          typeof value === 'number'
            ? { numberValue: value }
            : { textValue: value };
        await prisma.formFieldAnswer.upsert({
          where: {
            responseId_fieldId: { responseId: response.id, fieldId: field.id },
          },
          create: { responseId: response.id, fieldId: field.id, ...answer },
          update: answer,
        });
      }
    }

    const serverCategory = await prisma.serverCategory.upsert({
      where: { slug: DEMO_SERVER_CATEGORY.slug },
      create: { ...DEMO_SERVER_CATEGORY },
      update: { name: DEMO_SERVER_CATEGORY.name },
    });
    for (const s of DEMO_SERVERS) {
      const data = {
        name: s.name,
        address: s.address,
        type: s.type,
        description: s.description,
        order: s.order,
        categoryId: serverCategory.id,
      };
      await prisma.server.upsert({
        where: { slug: s.slug },
        create: { slug: s.slug, ...data },
        update: data,
      });
    }

    for (const p of DEMO_PUNISHMENTS) {
      const startedAt = daysAgo(p.daysAgo);
      const until =
        p.durationDays === null
          ? null
          : new Date(startedAt.getTime() + p.durationDays * DAY);
      const data = {
        subjectName: p.subjectName,
        reason: p.reason,
        status: p.status,
        startedAt,
        until,
        executorIsConsole: true,
        issuerHidden: true,
        rowHash: `demo${String(p.sourceId).padStart(60, '0')}`,
      };
      await prisma.minecraftPunishment.upsert({
        where: {
          source_sourceScope_kind_sourceId: {
            source: 'demo',
            sourceScope: 'demo',
            kind: p.kind,
            sourceId: BigInt(p.sourceId),
          },
        },
        create: {
          source: 'demo',
          sourceScope: 'demo',
          kind: p.kind,
          sourceId: BigInt(p.sourceId),
          ...data,
        },
        update: data,
      });
    }

    for (const a of DEMO_ACHIEVEMENTS) {
      const data = {
        name: a.name,
        description: a.description,
        iconUrl: '/assets/achievements/demo.svg',
        category: a.category,
        rarity: a.rarity,
        conditionType: a.conditionType,
        conditionValue: a.conditionValue,
      };
      await prisma.achievement.upsert({
        where: { slug: a.slug },
        create: { slug: a.slug, ...data },
        update: data,
      });
    }

    await prisma.voteSite.upsert({
      where: { slug: DEMO_VOTE_SITE.slug },
      create: {
        ...DEMO_VOTE_SITE,
        // Не секрет: заведомо невалидный хеш, вебхук демо-сайта не принимается.
        webhookSecretHash: 'demo-disabled',
      },
      update: { name: DEMO_VOTE_SITE.name, url: DEMO_VOTE_SITE.url },
    });

    for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }

    console.log(
      `Демо: категорий ${DEMO_CATEGORIES.length}, товаров ${products.length}, новостей ${DEMO_NEWS.length}, форм ${DEMO_FORMS.length}, серверов ${DEMO_SERVERS.length}, наказаний ${DEMO_PUNISHMENTS.length}, достижений ${DEMO_ACHIEVEMENTS.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
