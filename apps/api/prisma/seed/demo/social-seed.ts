import type { PrismaClient } from '@prisma/client';
import {
  DEMO_APPEALS,
  DEMO_PUNISHMENT_ACCOUNT,
  DEMO_PUNISHMENT_SCOPE,
  DEMO_PUNISHMENT_SOURCE,
  demoEscapeToHtml,
  demoPunishmentSourceId,
} from './data';
import { formatBlockReport, newBlockReport, runBlock } from './blocks';
import { assertDemoSeedAllowed, assertDemoUserNotForeign } from './guard';
import {
  DEMO_CONVERSATIONS,
  DEMO_FRIENDSHIPS,
  DEMO_INVENTORY_SERVER_SLUG,
  DEMO_PLAYERS,
  DEMO_PROFILE_COMMENTS,
  DEMO_USER_PASSWORD,
  buildDemoInventoryRow,
  buildDemoStatsRow,
  demoCommentHtml,
  demoDirectKey,
  demoPlayerEmail,
  demoPlayerTag,
} from './social';

const MINUTE = 60_000;
const DAY = 86_400_000;

/// Демо-соцданные. Затрагивает только пользователей `demo_*` из списка;
/// чужого пользователя с таким ником не меняет, а прерывает сид. Идемпотентно.
export async function seedDemoSocial(
  prisma: PrismaClient,
  defaultPositionId: string,
): Promise<string> {
  // Прямой вызов не обходит защиту: проверка окружения первой строкой.
  assertDemoSeedAllowed(process.env);
  // Ни одной записи, пока все ники не проверены на чужих пользователей.
  for (const p of DEMO_PLAYERS) {
    await assertDemoUserNotForeign(
      prisma,
      p.username,
      demoPlayerEmail(p.username),
    );
  }
  const now = new Date();
  const ids = new Map<string, string>();
  const report = newBlockReport();

  // Пользователи и статистика — основа остальных блоков; их сбой фатален.
  for (const p of DEMO_PLAYERS) {
    const profile = { statusText: p.statusText, bio: p.bio };
    const user = await prisma.user.upsert({
      where: { username: p.username },
      create: {
        username: p.username,
        tag: demoPlayerTag(p.username),
        discriminator: 0,
        email: demoPlayerEmail(p.username),
        password: DEMO_USER_PASSWORD,
        positionId: defaultPositionId,
        ...profile,
      },
      // email и пароль существующего пользователя не перезаписываются.
      update: profile,
    });
    ids.set(p.username, user.id);

    const stats = buildDemoStatsRow(p);
    await prisma.playerStatistics.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...stats },
      update: stats,
    });
  }
  const idOf = (username: string): string => {
    const id = ids.get(username);
    if (!id) throw new Error(`Демо-пользователь не найден: ${username}`);
    return id;
  };

  await runBlock(report, 'инвентарь', async () => {
    // Приватность не создаётся: нет строки InventoryPrivacy = «приватно».
    for (const p of DEMO_PLAYERS) {
      for (const grp of ['main', 'ender'] as const) {
        const row = buildDemoInventoryRow(p, grp, now);
        await prisma.playerInventory.upsert({
          where: {
            userId_serverSlug_grp: {
              userId: idOf(p.username),
              serverSlug: DEMO_INVENTORY_SERVER_SLUG,
              grp,
            },
          },
          create: {
            userId: idOf(p.username),
            serverSlug: DEMO_INVENTORY_SERVER_SLUG,
            grp,
            ...row,
          },
          update: row,
        });
      }
    }
  });

  await runBlock(report, 'дружбы', async () => {
    for (const [requester, addressee, status] of DEMO_FRIENDSHIPS) {
      const data = {
        status,
        acceptedAt:
          status === 'ACCEPTED' ? new Date(now.getTime() - 7 * DAY) : null,
      };
      // Пара уже есть в обратную сторону — второй записи не создаём.
      const reverse = await prisma.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: idOf(addressee),
            addresseeId: idOf(requester),
          },
        },
        select: { id: true },
      });
      if (reverse) continue;
      await prisma.friendship.upsert({
        where: {
          requesterId_addresseeId: {
            requesterId: idOf(requester),
            addresseeId: idOf(addressee),
          },
        },
        create: {
          requesterId: idOf(requester),
          addresseeId: idOf(addressee),
          ...data,
        },
        update: data,
      });
    }
  });

  await runBlock(report, 'беседы', async () => {
    for (const c of DEMO_CONVERSATIONS) {
      const lastMinutes = Math.min(...c.messages.map((m) => m.minutesAgo));
      const lastMessageAt = new Date(now.getTime() - lastMinutes * MINUTE);
      const memberIds = c.members.map(idOf);
      const directKey =
        c.type === 'DIRECT' ? demoDirectKey(memberIds[0], memberIds[1]) : null;
      // directKey симметричен (пара сортируется): находит ЛС в обе стороны.
      const existingDirect = directKey
        ? await prisma.conversation.findUnique({
            where: { directKey },
            select: { id: true },
          })
        : null;
      const conversationId = existingDirect?.id ?? c.id;
      const conversation = await prisma.conversation.upsert({
        where: { id: conversationId },
        create: {
          id: conversationId,
          type: c.type,
          title: c.title,
          createdById: idOf(c.owner),
          lastMessageAt,
          directKey,
        },
        update: { lastMessageAt },
      });
      for (const username of c.members) {
        await prisma.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: conversation.id,
              userId: idOf(username),
            },
          },
          create: {
            conversationId: conversation.id,
            userId: idOf(username),
            role:
              c.type === 'GROUP' && username === c.owner ? 'OWNER' : 'MEMBER',
          },
          update: {},
        });
      }
      for (const m of c.messages) {
        const data = {
          conversationId: conversation.id,
          senderId: idOf(m.sender),
          content: m.text,
          contentHtml: demoEscapeToHtml(m.text),
        };
        await prisma.directMessage.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            ...data,
            createdAt: new Date(now.getTime() - m.minutesAgo * MINUTE),
          },
          update: data,
        });
      }
    }
  });

  await runBlock(report, 'комментарии профиля', async () => {
    // Родитель стоит в списке раньше ответа.
    for (const c of DEMO_PROFILE_COMMENTS) {
      const data = {
        profileId: idOf(c.profile),
        authorId: idOf(c.author),
        content: c.text,
        contentHtml: demoCommentHtml(c.text),
        parentId: c.parentId ?? null,
        mentions: [] as string[],
      };
      await prisma.profileComment.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          ...data,
          createdAt: new Date(now.getTime() - c.daysAgo * DAY),
        },
        update: data,
      });
    }
  });

  return `игроков ${DEMO_PLAYERS.length}, дружб ${DEMO_FRIENDSHIPS.length}, бесед ${DEMO_CONVERSATIONS.length}, комментариев профиля ${DEMO_PROFILE_COMMENTS.length} (${formatBlockReport(report)})`;
}

/// «Мои наказания» и обжалования демо-игрока: фиктивный (не офлайн) Minecraft-
/// аккаунт и Report PUNISHMENT_APPEAL. Вызывать ПОСЛЕ сида наказаний и соцданных.
/// Только upsert по уникальным ключам (повтор не дублирует); затрагивает
/// лишь demo_ember и его демо-записи.
export async function seedDemoPunishmentLinks(
  prisma: PrismaClient,
): Promise<string> {
  assertDemoSeedAllowed(process.env);
  const { username, uuid, name } = DEMO_PUNISHMENT_ACCOUNT;
  await assertDemoUserNotForeign(prisma, username, demoPlayerEmail(username));
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) {
    throw new Error(`Демо-пользователь не найден: ${username} (сначала сид соцданных)`);
  }
  await prisma.minecraftAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, uuid, name },
    update: { uuid, name },
  });
  const now = Date.now();
  for (const a of DEMO_APPEALS) {
    const punishment = await prisma.minecraftPunishment.findUnique({
      where: {
        source_sourceScope_kind_sourceId: {
          source: DEMO_PUNISHMENT_SOURCE,
          sourceScope: DEMO_PUNISHMENT_SCOPE,
          kind: a.punishmentKind,
          sourceId: demoPunishmentSourceId(a.punishmentSourceId),
        },
      },
      select: { id: true },
    });
    if (!punishment) {
      throw new Error(
        `Демо-наказание ${a.punishmentSourceId} не найдено (сначала сид наказаний)`,
      );
    }
    const data = {
      type: 'PUNISHMENT_APPEAL' as const,
      status: a.status,
      authorId: user.id,
      description: a.description,
      appealedMinecraftPunishmentId: punishment.id,
      verdict: a.verdict,
      resolvedAt:
        a.resolvedDaysAgo === null
          ? null
          : new Date(now - a.resolvedDaysAgo * DAY),
    };
    await prisma.report.upsert({
      where: { reportNumber: a.reportNumber },
      create: {
        reportNumber: a.reportNumber,
        ...data,
        createdAt: new Date(now - a.daysAgo * DAY),
      },
      // Существующее (возможно обработанное) обращение не трогаем.
      update: {},
    });
  }
  return `аккаунт ${name}, обжалований ${DEMO_APPEALS.length}`;
}
