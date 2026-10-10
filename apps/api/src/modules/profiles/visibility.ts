import type { PrismaService } from '../prisma/prisma.service';

/// Видимость профиля для зрителя (ADR-0106, ADR-0111) — один источник для
/// профиля, превью и комментариев: владелец — всегда; блокировка в любую
/// сторону — скрыт; NOBODY — скрыт; FRIENDS_ONLY — только принятым друзьям;
/// EVERYONE — всем.
export async function canViewProfile(
  prisma: PrismaService,
  user: { id: string; profileVisibility: string },
  viewerId: string | null,
): Promise<boolean> {
  if (viewerId === user.id) return true;
  if (user.profileVisibility === 'NOBODY') return false;
  if (!viewerId) return user.profileVisibility === 'EVERYONE';
  const relations = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: user.id },
        { requesterId: user.id, addresseeId: viewerId },
      ],
    },
    select: { status: true },
  });
  if (relations.some((item) => item.status === 'BLOCKED')) return false;
  if (user.profileVisibility === 'FRIENDS_ONLY') {
    return relations.some((item) => item.status === 'ACCEPTED');
  }
  return true;
}

/// Блокировка между двумя игроками в любую сторону.
export async function isBlockedBetween(
  prisma: PrismaService,
  a: string,
  b: string,
): Promise<boolean> {
  const row = await prisma.friendship.findFirst({
    where: {
      status: 'BLOCKED',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}
