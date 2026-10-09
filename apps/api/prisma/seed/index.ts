import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@twomc/shared';
import { seedBootstrapAccounts } from './bootstrap';
import { DEFAULT_POSITIONS } from './positions';
import { SUPERUSER_ROLES } from './roles';

const prisma = new PrismaClient();

/// Идемпотентно: можно запускать повторно (upsert по unique key/slug), не
/// дублирует и не затирает вручную настроенные поля ролей при повторном
/// запуске (кроме displayName/priority самих superuser-ролей — они источник
/// истины здесь, не настраиваются через UI).
async function main(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: {
        module: permission.module,
        description: permission.description,
      },
    });
  }
  console.log(`Permissions: ${PERMISSIONS.length} синхронизировано`);

  for (const position of DEFAULT_POSITIONS) {
    await prisma.position.upsert({
      where: { slug: position.slug },
      create: position,
      update: { displayName: position.displayName, color: position.color },
    });
  }
  console.log(`Позиции: ${DEFAULT_POSITIONS.length} синхронизировано`);

  for (const role of SUPERUSER_ROLES) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      create: {
        ...role,
        isSystem: true,
        isSuperuser: true,
        isAssignable: true,
      },
      update: { displayName: role.displayName, priority: role.priority },
    });
  }
  console.log(`Superuser-роли: ${SUPERUSER_ROLES.length} синхронизировано`);

  await seedBootstrapAccounts(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
