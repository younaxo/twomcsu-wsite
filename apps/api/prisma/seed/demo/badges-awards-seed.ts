import type { PrismaClient } from '@prisma/client';
import { assertDemoSeedAllowed } from './guard';

/// Существующие типы бейджей, выдаваемые тестовому игроку стенда.
export const STAND_BADGE_TYPES = ['VERIFIED', 'SUBSCRIBER_PLUS'] as const;

/// ДЕМО: определения наград (иконка — существующий ассет сайта в public).
export const DEMO_AWARDS = [
  {
    slug: 'demo-award-first-steps',
    name: 'Демо: Первые шаги',
    description: '[Демо] Тестовая награда для витрины профиля.',
    iconUrl: '/icons/icon-192.png',
    color: '#F26A1B',
    rarity: 'common',
  },
  {
    slug: 'demo-award-veteran',
    name: 'Демо: Ветеран',
    description: '[Демо] Тестовая награда редкой рамки.',
    iconUrl: '/icons/icon-512.png',
    color: '#3B82F6',
    rarity: 'rare',
  },
] as const;

/// Демо-бейджи и награды тестового игрока стенда (DEMO_STAND_PLAYER_USERNAME).
/// Другим пользователям ничего не выдаётся. Выбранный displayBadge не
/// перетирается. Идемпотентно (upsert по стабильным ключам).
export async function seedDemoStandBadgesAndAwards(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  assertDemoSeedAllowed(env);
  const username = env.DEMO_STAND_PLAYER_USERNAME?.trim();
  if (!username) return 'бейджи и награды стенда: не задан игрок';
  if (username.startsWith('demo_')) {
    return 'бейджи и награды стенда: пропуск (demo_*)';
  }
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, displayBadgeId: true },
  });
  if (!user) {
    console.warn(
      'Тестовый игрок стенда не найден: бейджи и награды пропущены.',
    );
    return 'бейджи и награды стенда: игрок не найден, пропуск';
  }

  const badgeIds = new Map<string, string>();
  for (const [order, type] of STAND_BADGE_TYPES.entries()) {
    const row = await prisma.userBadge.upsert({
      where: { userId_type: { userId: user.id, type } },
      create: { userId: user.id, type, order },
      // Уже выданный бейдж (возможно с ручным порядком) не меняем.
      update: {},
    });
    badgeIds.set(type, row.id);
  }
  if (!user.displayBadgeId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { displayBadgeId: badgeIds.get('VERIFIED')! },
    });
  }

  for (const [order, a] of DEMO_AWARDS.entries()) {
    const data = {
      name: a.name,
      description: a.description,
      iconUrl: a.iconUrl,
      color: a.color,
      rarity: a.rarity,
      isActive: true,
    };
    const award = await prisma.award.upsert({
      where: { slug: a.slug },
      create: { slug: a.slug, ...data },
      update: data,
    });
    await prisma.userAward.upsert({
      where: { userId_awardId: { userId: user.id, awardId: award.id } },
      create: { userId: user.id, awardId: award.id, order },
      update: {},
    });
  }
  return `бейджи и награды стенда: бейджей ${STAND_BADGE_TYPES.length}, наград ${DEMO_AWARDS.length}`;
}
