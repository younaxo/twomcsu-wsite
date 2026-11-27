import type { PrismaClient } from '@prisma/client';
import {
  DEMO_PUNISHMENT_SCOPE,
  DEMO_PUNISHMENT_SOURCE,
  buildDemoPunishmentRow,
  demoPunishmentSourceId,
  type DemoPunishment,
} from './data';
import { assertDemoSeedAllowed } from './guard';

const DAY = 86_400_000;

/// ДЕМО: фиктивный uuid версии 4 (третья группа начинается с 4, не офлайн-версия 3)
/// для тестового игрока стенда, у которого ещё нет MinecraftAccount.
export const STAND_PLAYER_UUID = 'de30c0de-0000-4000-8000-0000005747a4';
export const STAND_PLAYER_NAME = 'StandPlayer';
export const STAND_APPEAL_NUMBER = 'R-DEMO-STAND-APPEAL-1';

/// Три наказания тестового игрока (id отличаются от DEMO_PUNISHMENTS).
export const STAND_PUNISHMENTS: Omit<
  DemoPunishment,
  'subjectName' | 'subjectUuid'
>[] = [
  {
    sourceId: 9101,
    kind: 'BAN',
    reason: 'Грифинг',
    status: 'ACTIVE',
    daysAgo: 2,
    durationDays: null,
  },
  {
    sourceId: 9102,
    kind: 'MUTE',
    reason: 'Флуд',
    status: 'EXPIRED',
    daysAgo: 9,
    durationDays: 3,
  },
  {
    sourceId: 9103,
    kind: 'WARN',
    reason: 'Оскорбления',
    status: 'EXPIRED',
    daysAgo: 20,
    durationDays: 10,
  },
];

/// Демо-наказания и обжалование для тестового игрока стенда (имя в
/// DEMO_STAND_PLAYER_USERNAME). Пароль, роли, 2FA и прочие данные пользователя
/// не меняются; имя в логи не попадает. Идемпотентно (upsert).
export async function seedDemoStandPlayer(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  assertDemoSeedAllowed(process.env);
  const username = env.DEMO_STAND_PLAYER_USERNAME?.trim();
  if (!username) return 'тестовый игрок стенда: не задан';
  if (username.startsWith('demo_')) {
    return 'тестовый игрок стенда: пропуск (demo_*)';
  }
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) {
    console.warn('Тестовый игрок стенда не найден: пропуск.');
    return 'тестовый игрок стенда: не найден, пропуск';
  }

  let account = await prisma.minecraftAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    const holder = await prisma.minecraftAccount.findUnique({
      where: { uuid: STAND_PLAYER_UUID },
    });
    if (holder && holder.userId !== user.id) {
      console.warn('Фиктивный uuid тестового игрока занят: пропуск.');
      return 'тестовый игрок стенда: uuid занят, пропуск';
    }
    account = await prisma.minecraftAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        uuid: STAND_PLAYER_UUID,
        name: STAND_PLAYER_NAME,
      },
      update: {},
    });
  }

  const now = new Date();
  const ids = new Map<string, string>();
  for (const p of STAND_PUNISHMENTS) {
    const data = buildDemoPunishmentRow(
      { ...p, subjectName: account.name, subjectUuid: account.uuid },
      now,
    );
    const row = await prisma.minecraftPunishment.upsert({
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
    ids.set(p.kind, row.id);
  }

  // Одно открытое обращение на BAN (reports_open_mc_appeal_uniq).
  const data = {
    type: 'PUNISHMENT_APPEAL' as const,
    status: 'IN_REVIEW' as const,
    authorId: user.id,
    description: '[Демо] Тестовое обжалование блокировки тестового игрока.',
    appealedMinecraftPunishmentId: ids.get('BAN')!,
    verdict: null,
    resolvedAt: null,
  };
  await prisma.report.upsert({
    where: { reportNumber: STAND_APPEAL_NUMBER },
    create: {
      reportNumber: STAND_APPEAL_NUMBER,
      ...data,
      createdAt: new Date(now.getTime() - 0.5 * DAY),
    },
    update: data,
  });
  return `тестовый игрок стенда: наказаний ${STAND_PUNISHMENTS.length}, обжалование 1`;
}
