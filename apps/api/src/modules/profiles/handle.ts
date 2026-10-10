import type { PrismaService } from '../prisma/prisma.service';

/// Пользователь по «handle» из адреса профиля (B5): ник сайта → alias входа
/// (bootstrap: `younaxo` → `younaxo_`, ADR-0061) → ник привязанного
/// Minecraft-аккаунта. Регистр не важен. Нет совпадений — null.
export async function resolveUserIdByHandle(
  prisma: PrismaService,
  handle: string,
): Promise<string | null> {
  const value = handle.trim();
  if (!value || value.length > 32) return null;
  const byName = await prisma.user.findFirst({
    where: { username: { equals: value, mode: 'insensitive' } },
    select: { id: true },
  });
  if (byName) return byName.id;
  const alias = await prisma.loginAlias.findUnique({
    where: { alias: value.toLowerCase() },
    select: { userId: true },
  });
  if (alias) return alias.userId;
  const minecraft = await prisma.minecraftAccount.findFirst({
    where: { name: { equals: value, mode: 'insensitive' } },
    select: { userId: true },
  });
  return minecraft?.userId ?? null;
}
