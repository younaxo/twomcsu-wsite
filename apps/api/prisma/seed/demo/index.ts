import { PrismaClient } from '@prisma/client';
import {
  DEMO_ACHIEVEMENTS,
  DEMO_AUTHOR,
  DEMO_CATEGORIES,
  DEMO_EVENTS,
  DEMO_FORMS,
  DEMO_NEWS,
  DEMO_PUNISHMENT_SCOPE,
  DEMO_PUNISHMENT_SOURCE,
  DEMO_PUNISHMENTS,
  DEMO_SERVER_CATEGORY,
  DEMO_SERVERS,
  DEMO_SETTINGS,
  DEMO_TOPICS,
  DEMO_VOTE_SITE,
  buildDemoEventRow,
  buildDemoProducts,
  buildDemoPunishmentRow,
  buildDemoSyncState,
  buildDemoTopicRow,
  demoAuthorTag,
  demoPunishmentSourceId,
} from './data';
import { assertDemoSeedAllowed, assertDemoUserNotForeign } from './guard';
import { demoFieldId, demoResponseId } from './keys';
import { DEMO_PLAYERS, demoPlayerEmail } from './social';
import { seedDemoPunishmentLinks, seedDemoSocial } from './social-seed';
import { seedDemoStandBadgesAndAwards } from './badges-awards-seed';
import { seedDemoStandPlayer } from './stand-player';
import { seedDemoWalletAndOrders } from './wallet-orders-seed';

const DAY = 86_400_000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

/// Dev-only демо-данные. Запуск: `pnpm --filter api db:seed:demo`
/// (NODE_ENV=development, SEED_DEMO=1, локальная БД). Идемпотентно.
async function main(): Promise<void> {
  assertDemoSeedAllowed(process.env);
  const prisma = new PrismaClient();
  try {
    // Отдельный демо-автор: реальные пользователи не попадают в публичные ответы.
    // Без ролей; пароль — не bcrypt-хеш, вход невозможен.
    const defaultPosition = await prisma.position.findFirst({
      where: { isDefault: true },
    });
    if (!defaultPosition) {
      throw new Error(
        'Нет позиции по умолчанию (isDefault): сначала выполните обычный `db:seed`.',
      );
    }
    // Чужого пользователя demo_system не трогаем: прерываем сид до записей.
    await assertDemoUserNotForeign(
      prisma,
      DEMO_AUTHOR.username,
      DEMO_AUTHOR.email,
    );
    for (const p of DEMO_PLAYERS) {
      await assertDemoUserNotForeign(
        prisma,
        p.username,
        demoPlayerEmail(p.username),
      );
    }
    const authorData = {
      email: DEMO_AUTHOR.email,
      password: DEMO_AUTHOR.password,
    };
    const author = await prisma.user.upsert({
      where: { username: DEMO_AUTHOR.username },
      create: {
        username: DEMO_AUTHOR.username,
        tag: demoAuthorTag(),
        discriminator: DEMO_AUTHOR.discriminator,
        positionId: defaultPosition.id,
        ...authorData,
      },
      // email и пароль существующего demo_system не перезаписываются.
      update: {},
    });

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

    for (const t of DEMO_TOPICS) {
      const data = buildDemoTopicRow(t);
      await prisma.topic.upsert({
        where: { slug: t.slug },
        create: { slug: t.slug, createdBy: author.id, ...data },
        update: data,
      });
    }

    const eventsNow = new Date();
    for (const e of DEMO_EVENTS) {
      const data = buildDemoEventRow(e, eventsNow);
      await prisma.calendarEvent.upsert({
        where: { slug: e.slug },
        create: { slug: e.slug, createdById: author.id, ...data },
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
      const fields = [];
      for (const [order, fld] of f.fields.entries()) {
        const fieldData = {
          type: fld.type,
          label: fld.label,
          isRequired: fld.isRequired,
          options: fld.options,
          order,
        };
        fields.push(
          await prisma.formField.upsert({
            where: { id: demoFieldId(f.slug, order) },
            create: {
              id: demoFieldId(f.slug, order),
              formId: form.id,
              ...fieldData,
            },
            update: fieldData,
          }),
        );
      }
      const responseId = demoResponseId(f.slug);
      const existingResponse = await prisma.formResponse.findUnique({
        where: { id: responseId },
        select: { id: true },
      });
      const response = await prisma.formResponse.upsert({
        where: { id: responseId },
        create: {
          id: responseId,
          formId: form.id,
          isAnonymous: true,
          isComplete: true,
          completedAt: new Date(),
          metadata: { demo: true },
        },
        update: {},
      });
      if (!existingResponse) {
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

    const punishNow = new Date();
    for (const p of DEMO_PUNISHMENTS) {
      const data = buildDemoPunishmentRow(p, punishNow);
      await prisma.minecraftPunishment.upsert({
        where: {
          source_sourceScope_kind_sourceId: {
            source: DEMO_PUNISHMENT_SOURCE,
            sourceScope: DEMO_PUNISHMENT_SCOPE,
            kind: p.kind,
            sourceId: demoPunishmentSourceId(p.sourceId),
          },
        },
        create: {
          source: DEMO_PUNISHMENT_SOURCE,
          sourceScope: DEMO_PUNISHMENT_SCOPE,
          kind: p.kind,
          sourceId: demoPunishmentSourceId(p.sourceId),
          ...data,
        },
        update: data,
      });
    }
    for (const st of buildDemoSyncState(punishNow)) {
      await prisma.punishmentSyncState.upsert({
        where: { source_kind: { source: st.source, kind: st.kind } },
        create: st,
        update: {
          initialSyncDoneAt: st.initialSyncDoneAt,
          lastSuccessAt: st.lastSuccessAt,
        },
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

    const socialSummary = await seedDemoSocial(prisma, defaultPosition.id);
    const linksSummary = await seedDemoPunishmentLinks(prisma);
    const standSummary = await seedDemoStandPlayer(prisma);
    const walletSummary = await seedDemoWalletAndOrders(prisma);
    const badgesSummary = await seedDemoStandBadgesAndAwards(prisma);

    console.log(
      `Демо: категорий ${DEMO_CATEGORIES.length}, товаров ${products.length}, новостей ${DEMO_NEWS.length}, форм ${DEMO_FORMS.length}, серверов ${DEMO_SERVERS.length}, наказаний ${DEMO_PUNISHMENTS.length}, тем ${DEMO_TOPICS.length}, событий ${DEMO_EVENTS.length}, достижений ${DEMO_ACHIEVEMENTS.length}, ${socialSummary}, ${linksSummary}, ${standSummary}, ${walletSummary}, ${badgesSummary}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
