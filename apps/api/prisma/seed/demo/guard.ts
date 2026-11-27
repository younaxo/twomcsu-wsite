/// Защита запуска демо-сида (fail closed): только development + SEED_DEMO=1 +
/// локальная БД. Пустой/незаданный NODE_ENV считается production.
export interface DemoGuardInput {
  NODE_ENV?: string;
  SEED_DEMO?: string;
  DATABASE_URL?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/// Белый список query-параметров: любые другие (host, hostaddr, socket, ...)
/// могут сменить адрес подключения и потому отклоняются (без учёта регистра).
const SAFE_QUERY_PARAMS = new Set(['schema', 'sslmode', 'connection_limit']);

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes(',') || parsed.host.includes(','))
      return false;
    for (const key of parsed.searchParams.keys()) {
      if (!SAFE_QUERY_PARAMS.has(key.toLowerCase())) return false;
    }
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/// Возвращает список причин отказа; пустой список = запуск разрешён.
export function demoSeedRefusals(env: DemoGuardInput): string[] {
  const reasons: string[] = [];
  if (env.NODE_ENV !== 'development') {
    reasons.push(
      'NODE_ENV должен быть ровно "development" (пустой/незаданный = production)',
    );
  }
  if (env.SEED_DEMO !== '1') {
    reasons.push('SEED_DEMO должен быть равен 1');
  }
  if (!isLocalDatabaseUrl(env.DATABASE_URL)) {
    reasons.push('DATABASE_URL должен указывать на localhost или 127.0.0.1');
  }
  return reasons;
}

export function assertDemoSeedAllowed(env: DemoGuardInput): void {
  const reasons = demoSeedRefusals(env);
  if (reasons.length > 0) {
    throw new Error(
      `Демо-сид отклонён (fail closed):\n - ${reasons.join('\n - ')}`,
    );
  }
}

/// Минимальный срез Prisma для проверки владения: только чтение email.
export interface DemoUserLookup {
  user: {
    findUnique(args: {
      where: { username: string };
      select: { email: true };
    }): Promise<{ email: string } | null>;
  };
}

/// Прерывает сид, если пользователь с таким username уже есть и его email не
/// демо-шный: чужого пользователя сид не трогает (ни email, ни пароль).
export async function assertDemoUserNotForeign(
  prisma: DemoUserLookup,
  username: string,
  expectedEmail: string,
): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { email: true },
  });
  if (existing && existing.email !== expectedEmail) {
    throw new Error(
      `Демо-сид прерван: пользователь "${username}" уже существует и не является демо-пользователем (email отличается от ${expectedEmail}). Ничего не изменено; освободите ник или запустите сид на чистой одноразовой БД.`,
    );
  }
}
