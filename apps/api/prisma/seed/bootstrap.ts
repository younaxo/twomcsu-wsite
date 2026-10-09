import { AccountType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/// Bootstrap-аккаунты по ADR-0006 / 44-TARGET-ARCHITECTURE §5:
///   #0 SYSTEM        — actor системных действий, вход по паролю запрещён;
///   #1 Owner         — владелец;
///   #2 Chief Curator — главный куратор.
///
/// Пароли берутся ТОЛЬКО из env (`BOOTSTRAP_*_PASSWORD`), в код и git не
/// попадают. Без пароля аккаунт не создаётся: в development — предупреждение,
/// в production — ошибка seed. Идентичность #1/#2 (username/email) — тоже
/// из env; для #2 заданы значения владельца проекта по умолчанию.
/// Идемпотентно: повторный запуск обновляет пароль/роль, не плодит записи.

const BCRYPT_ROUNDS = 12;

interface BootstrapAccount {
  shortId: 0 | 1 | 2;
  label: string;
  username: string | undefined;
  /// Точечный alias входа (ADR-0061); у остальных login = username.
  loginAlias?: string;
  email: string | undefined;
  passwordEnv: string;
  roleSlug: 'owner' | 'chief-curator' | null;
  accountType: AccountType;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function accounts(): BootstrapAccount[] {
  return [
    {
      shortId: 0,
      label: 'SYSTEM',
      username: env('BOOTSTRAP_SYSTEM_USERNAME') ?? 'system',
      email: env('BOOTSTRAP_SYSTEM_EMAIL') ?? 'system@twomc.su',
      passwordEnv: 'BOOTSTRAP_SYSTEM_PASSWORD',
      roleSlug: null,
      accountType: AccountType.SYSTEM,
    },
    {
      shortId: 1,
      label: 'Owner',
      username: env('BOOTSTRAP_OWNER_USERNAME'),
      email: env('BOOTSTRAP_OWNER_EMAIL'),
      passwordEnv: 'BOOTSTRAP_OWNER_PASSWORD',
      roleSlug: 'owner',
      accountType: AccountType.DEFAULT,
    },
    {
      shortId: 2,
      label: 'Chief Curator',
      // Ник (= Minecraft-ник) younaxo_, вход дополнительно по alias younaxo.
      username: env('BOOTSTRAP_CHIEF_CURATOR_USERNAME') ?? 'younaxo_',
      loginAlias: env('BOOTSTRAP_CHIEF_CURATOR_LOGIN_ALIAS') ?? 'younaxo',
      email: env('BOOTSTRAP_CHIEF_CURATOR_EMAIL') ?? 'younaxo@icloud.com',
      passwordEnv: 'BOOTSTRAP_CHIEF_CURATOR_PASSWORD',
      roleSlug: 'chief-curator',
      accountType: AccountType.DEFAULT,
    },
  ];
}

function envLabel(label: string): string {
  return label.toUpperCase().replace(/ /g, '_');
}

/// Уровень доступа (ADR-0062) задаётся только явно через env
/// `BOOTSTRAP_<LABEL>_ACCESS_LEVEL`; без него seed значение не трогает.
function accessLevelFromEnv(label: string): number | undefined {
  const raw = env(`BOOTSTRAP_${envLabel(label)}_ACCESS_LEVEL`);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`Bootstrap: некорректный уровень доступа «${raw}» (0…100)`);
  }
  return value;
}

/// Alias входа: не должен совпадать с чужим ником (вход стал бы неоднозначным).
async function upsertLoginAlias(
  prisma: PrismaClient,
  userId: string,
  rawAlias: string,
): Promise<void> {
  const alias = rawAlias.toLowerCase();
  const clash = await prisma.user.findFirst({
    where: {
      username: { equals: alias, mode: 'insensitive' },
      NOT: { id: userId },
    },
    select: { username: true },
  });
  if (clash) {
    throw new Error(
      `Bootstrap: alias входа «${alias}» совпадает с ником «${clash.username}» другого пользователя`,
    );
  }
  await prisma.loginAlias.upsert({
    where: { alias },
    create: { alias, userId },
    update: { userId },
  });
}

/// Тег вида `name#0000` для bootstrap-аккаунтов — фиксированный суффикс по
/// номеру, чтобы ссылки на профиль не менялись между окружениями.
function bootstrapTag(username: string, shortId: number): string {
  return `${username}#${String(shortId).padStart(4, '0')}`;
}

export async function seedBootstrapAccounts(
  prisma: PrismaClient,
): Promise<void> {
  const production = process.env.NODE_ENV === 'production';
  const position = await prisma.position.findUnique({
    where: { slug: 'default' },
  });
  if (!position) {
    throw new Error(
      'Bootstrap: позиция «default» не найдена — сначала seed позиций',
    );
  }

  for (const account of accounts()) {
    const password = env(account.passwordEnv);
    const missing: string[] = [];
    if (!password) missing.push(account.passwordEnv);
    if (!account.username)
      missing.push(`BOOTSTRAP_${envLabel(account.label)}_USERNAME`);
    if (!account.email)
      missing.push(`BOOTSTRAP_${envLabel(account.label)}_EMAIL`);
    if (missing.length > 0) {
      const message = `Bootstrap #${account.shortId} (${account.label}) пропущен: не задано ${missing.join(', ')}`;
      if (production) {
        throw new Error(message);
      }
      console.warn(message);
      continue;
    }

    const username = account.username as string;
    const email = (account.email as string).toLowerCase();
    // SYSTEM: вход по паролю невозможен — хранится заведомо невалидный hash
    // (bcrypt.compare → false), дополнительно login отвергает accountType=SYSTEM.
    const passwordHash =
      account.accountType === AccountType.SYSTEM
        ? '!system-login-disabled'
        : await bcrypt.hash(password as string, BCRYPT_ROUNDS);

    const occupant = await prisma.user.findUnique({
      where: { shortId: account.shortId },
      select: { id: true, email: true, username: true },
    });
    if (occupant && occupant.email !== email) {
      throw new Error(
        `Bootstrap: #${account.shortId} уже занят пользователем «${occupant.username}» (${occupant.email}). ` +
          'Освободите номер или укажите в env e-mail этого пользователя.',
      );
    }

    const accessLevel = accessLevelFromEnv(account.label);
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    const user = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            password: passwordHash,
            ...(accessLevel !== undefined ? { accessLevel } : {}),
            accountType: account.accountType,
            mustChangePassword: account.accountType !== AccountType.SYSTEM,
            isBanned: false,
            banReason: null,
            bannedUntil: null,
          },
        })
      : await prisma.user.create({
          data: {
            shortId: account.shortId,
            username,
            email,
            tag: bootstrapTag(username, account.shortId),
            password: passwordHash,
            accountType: account.accountType,
            mustChangePassword: account.accountType !== AccountType.SYSTEM,
            isVerified: true,
            ...(accessLevel !== undefined ? { accessLevel } : {}),
            positionId: position.id,
          },
        });

    if (account.loginAlias) {
      await upsertLoginAlias(prisma, user.id, account.loginAlias);
    }

    if (account.roleSlug) {
      const role = await prisma.role.findUnique({
        where: { slug: account.roleSlug },
      });
      if (!role) {
        throw new Error(`Bootstrap: роль «${account.roleSlug}» не найдена`);
      }
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id, assignedBy: null },
        update: {},
      });
    }
    console.log(
      `Bootstrap #${account.shortId} (${account.label}): ${username} ${existingByEmail ? 'обновлён' : 'создан'}`,
    );
  }

  // Явная вставка shortId 0/1/2 не двигает sequence — выравниваем, чтобы
  // следующая регистрация не получила занятый номер.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('users', 'shortId'), GREATEST((SELECT COALESCE(MAX("shortId"), 1) FROM users), 1))`,
  );
}
