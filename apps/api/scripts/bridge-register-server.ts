import { PrismaClient } from '@prisma/client';
import { isProductionLike } from '../src/config/node-env';
import {
  CAPABILITY_KEYS,
  isValidSlug,
} from '../src/modules/bridge/bridge.constants';

/// Регистрация строки `BridgeServer` (F3, 2.4 контракта). Мастер-секрет НЕ
/// читается и НЕ нужен: команда создаёт только запись сервера, ключ она не
/// выводит (его печатает отдельная команда владельца `bridge-print-key`).
/// Пустой или незаданный NODE_ENV считается production и даёт отказ, если не
/// заданы оба флага владельца `--production --confirm-owner`.
///
///   pnpm --filter @twomc/api run bridge:register -- --slug survival --name "Survival" [--capabilities punishments,player-events]
export interface RegisterArgs {
  slug: string;
  displayName: string;
  capabilities: Record<string, true>;
}

export interface RegisterDb {
  bridgeServer: {
    findUnique(args: { where: { slug: string } }): Promise<unknown>;
    create(args: {
      data: {
        slug: string;
        displayName: string;
        capabilities: Record<string, true>;
      };
      select: { slug: true; keyGeneration: true };
    }): Promise<{ slug: string; keyGeneration: number }>;
  };
}

export function parseRegisterArgs(argv: string[]): RegisterArgs {
  const read = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const slug = read('--slug');
  if (!isValidSlug(slug)) {
    throw new Error(
      '--slug обязателен и должен соответствовать ^[a-z0-9][a-z0-9-]{1,31}$',
    );
  }
  const displayName = (read('--name') ?? slug).trim();
  if (displayName.length < 1 || displayName.length > 64) {
    throw new Error('--name: от 1 до 64 символов');
  }
  const capsRaw = read('--capabilities') ?? 'punishments';
  const capabilities: Record<string, true> = {};
  for (const cap of capsRaw.split(',').map((c) => c.trim())) {
    if (!(CAPABILITY_KEYS as readonly string[]).includes(cap)) {
      throw new Error(`Неизвестная возможность: ${cap}`);
    }
    capabilities[cap] = true;
  }
  return { slug, displayName, capabilities };
}

export async function registerServer(
  db: RegisterDb,
  argv: string[],
  nodeEnv: string | undefined,
): Promise<{ slug: string; keyGeneration: number }> {
  // Боевой режим (L5): только владелец и только с обоими явными флагами;
  // агенты эту команду с флагами не запускают (runbook bridge-server-registration).
  const ownerProduction =
    argv.includes('--production') && argv.includes('--confirm-owner');
  if (isProductionLike(nodeEnv) && !ownerProduction) {
    throw new Error(
      'Отказ: NODE_ENV пуст или не development/test (production-подобная среда). Боевую регистрацию выполняет только владелец с флагами --production --confirm-owner',
    );
  }
  const args = parseRegisterArgs(argv);
  if (await db.bridgeServer.findUnique({ where: { slug: args.slug } })) {
    throw new Error(`Сервер «${args.slug}» уже зарегистрирован`);
  }
  return db.bridgeServer.create({
    data: {
      slug: args.slug,
      displayName: args.displayName,
      capabilities: args.capabilities,
    },
    select: { slug: true, keyGeneration: true },
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const row = await registerServer(
      prisma,
      process.argv.slice(2),
      process.env.NODE_ENV,
    );
    console.log(
      `Сервер ${row.slug} зарегистрирован, поколение ключа ${row.keyGeneration}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
