import { PrismaClient } from '@prisma/client';

/// Ops-утилита: выдать/снять роль пользователю напрямую в БД (без API и
/// без проверки иерархии — только для первичной настройки окружения,
/// когда ещё нет ни одного администратора; дальше — через админ-панель).
///
///   pnpm --filter @twomc/api run grant-role -- --user <username> --role <slug> [--revoke]
///
/// Пишет запись в UserRole; audit log не затрагивает (операция вне API).
async function main() {
  const args = process.argv.slice(2);
  const read = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const username = read('--user');
  const slug = read('--role');
  const revoke = args.includes('--revoke');
  if (!username || !slug) {
    console.error('Использование: --user <username> --role <slug> [--revoke]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) {
      throw new Error(`Пользователь «${username}» не найден`);
    }
    const role = await prisma.role.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!role) {
      throw new Error(`Роль «${slug}» не найдена`);
    }
    if (revoke) {
      await prisma.userRole.deleteMany({
        where: { userId: user.id, roleId: role.id },
      });
      console.log(`Роль ${role.name} снята с ${username}`);
    } else {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id, assignedBy: null },
        update: {},
      });
      console.log(`Роль ${role.name} выдана ${username}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
