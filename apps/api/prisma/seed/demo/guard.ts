/// Защита запуска демо-сида (fail closed): только development + SEED_DEMO=1 +
/// локальная БД. Пустой/незаданный NODE_ENV считается production.
export interface DemoGuardInput {
  NODE_ENV?: string;
  SEED_DEMO?: string;
  DATABASE_URL?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
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
