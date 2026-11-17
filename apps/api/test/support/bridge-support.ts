import { BridgeServer } from '@prisma/client';
import {
  deriveServerKey,
  formatKeyId,
  signRequest,
} from '../../src/modules/bridge/bridge-crypto';
import {
  CLAIM_MARKER_SCRIPT,
  INCR_EXPIRE_SCRIPT,
  RELEASE_LOCK_SCRIPT,
} from '../../src/modules/bridge/bridge-redis.service';

/// Синтетические значения для тестов Bridge. Это НЕ боевой секрет: он нигде не
/// используется, кроме автотестов; значения из `.env*` и хранилища секретов не
/// читаются.
export const TEST_MASTER_SECRET =
  'test-master-secret-synthetic-0123456789-abcdef';
export const TEST_MASTER = Buffer.from(TEST_MASTER_SECRET, 'utf8');

export const SLUG = 'survival';

export function makeServer(over: Partial<BridgeServer> = {}): BridgeServer {
  return {
    id: 'srv-1',
    slug: SLUG,
    displayName: 'Survival',
    status: 'ACTIVE',
    keyGeneration: 1,
    previousGenValidTill: null,
    lastSeenAt: null,
    lastProtocol: null,
    pluginVersion: null,
    platform: null,
    clockSkewMs: null,
    capabilities: null,
    sourceScope: 'default',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    ...over,
  };
}

/// Минимальный клиент Redis в памяти: ровно те команды, что использует приёмник.
export class FakeRedisClient {
  readonly store = new Map<string, string>();
  readonly ttls = new Map<string, number>();
  failAll = false;
  calls: string[] = [];

  private guard(name: string): void {
    this.calls.push(name);
    if (this.failAll) throw new Error('redis down');
  }

  set(
    key: string,
    value: string,
    _ex: 'EX' | 'PX',
    ttl: number,
    nx?: 'NX',
  ): Promise<'OK' | null> {
    this.guard('set');
    if (nx === 'NX' && this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, value);
    this.ttls.set(key, ttl);
    return Promise.resolve('OK');
  }

  get(key: string): Promise<string | null> {
    this.guard('get');
    return Promise.resolve(this.store.get(key) ?? null);
  }

  ttl(key: string): Promise<number> {
    this.guard('ttl');
    if (!this.store.has(key)) return Promise.resolve(-2);
    return Promise.resolve(this.ttls.get(key) ?? 60);
  }

  incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  incrby(key: string, n: number): Promise<number> {
    this.guard('incrby');
    const next = Number(this.store.get(key) ?? '0') + n;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }

  decr(key: string): Promise<number> {
    this.guard('decr');
    const next = Number(this.store.get(key) ?? '0') - 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }

  expire(key: string, ttl: number): Promise<number> {
    this.guard('expire');
    this.ttls.set(key, ttl);
    return Promise.resolve(1);
  }

  del(key: string): Promise<number> {
    this.guard('del');
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }

  /// Lua-скрипты приёмника (по тексту скрипта): INCRBY+EXPIRE, сравнение и
  /// установка маркера, снятие блокировки по токену.
  eval(
    script: string,
    _n: number,
    key: string,
    ...args: string[]
  ): Promise<number> {
    this.guard('eval');
    if (script === INCR_EXPIRE_SCRIPT) {
      const [amount, ttl, mode] = args;
      const next = Number(this.store.get(key) ?? '0') + Number(amount);
      this.store.set(key, String(next));
      if (mode === 'always' || next === Number(amount)) {
        this.ttls.set(key, Number(ttl));
      }
      return Promise.resolve(next);
    }
    if (script === CLAIM_MARKER_SCRIPT) {
      const [value, ttl] = args;
      const cur = this.store.get(key);
      if (cur !== undefined && Number(cur) > Number(value)) {
        return Promise.resolve(0);
      }
      this.store.set(key, value);
      this.ttls.set(key, Number(ttl));
      return Promise.resolve(1);
    }
    if (script === RELEASE_LOCK_SCRIPT) {
      if (this.store.get(key) === args[0]) {
        this.store.delete(key);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }
    return Promise.reject(new Error('unknown script'));
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

export function fakeRedisService(client = new FakeRedisClient()) {
  return {
    client,
  } as unknown as import('../../src/modules/redis/redis.service').RedisService;
}

export interface LogRow {
  serverSlug: string;
  eventId: string;
  type: string;
  status: string;
  payloadHash: string;
}

/// Prisma в памяти: журнал с уникальностью `(serverSlug, eventId)` и
/// транзакция с откатом при исключении. Операции журнала доступны и внутри
/// транзакции, и вне её (приёмник пишет `received` в короткой транзакции, а
/// `applied` - отдельной записью после публикации).
export class FakePrisma {
  log = new Map<string, LogRow>();
  txCount = 0;
  bridgeServer = { update: jest.fn().mockResolvedValue({}) };

  private key(slug: string, id: string): string {
    return `${slug}\u0000${id}`;
  }

  bridgeEventLog = {
    createMany: ({ data }: { data: LogRow[]; skipDuplicates: boolean }) => {
      let count = 0;
      for (const row of data) {
        const k = this.key(row.serverSlug, row.eventId);
        if (!this.log.has(k)) {
          this.log.set(k, { ...row });
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    findUnique: ({
      where,
    }: {
      where: { serverSlug_eventId: { serverSlug: string; eventId: string } };
    }) => {
      const w = where.serverSlug_eventId;
      const row = this.log.get(this.key(w.serverSlug, w.eventId));
      return Promise.resolve(row === undefined ? null : { ...row });
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { serverSlug: string; eventId: string };
      data: Partial<LogRow>;
    }) => {
      const k = this.key(where.serverSlug, where.eventId);
      const row = this.log.get(k);
      if (row === undefined) return Promise.resolve({ count: 0 });
      this.log.set(k, { ...row, ...data });
      return Promise.resolve({ count: 1 });
    },
    deleteMany: ({
      where,
    }: {
      where: { serverSlug: string; eventId: string; status?: string };
    }) => {
      const k = this.key(where.serverSlug, where.eventId);
      const row = this.log.get(k);
      if (
        row === undefined ||
        (where.status !== undefined && row.status !== where.status)
      ) {
        return Promise.resolve({ count: 0 });
      }
      this.log.delete(k);
      return Promise.resolve({ count: 1 });
    },
  };

  async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    this.txCount += 1;
    const snapshot = new Map(this.log);
    try {
      return await fn({ bridgeEventLog: this.bridgeEventLog });
    } catch (err) {
      this.log = snapshot;
      throw err;
    }
  }
}

export const NONCE_A = 'AAAAAAAAAAAAAAAAAAAAAA';

let nonceCounter = 0;
/// Уникальный нонс валидного формата (22 символа base64url).
export function freshNonce(): string {
  nonceCounter += 1;
  return `n${String(nonceCounter).padStart(21, '0')}`;
}

export interface SignedHeaderOptions {
  slug?: string;
  generation?: number;
  nowMs?: number;
  nonce?: string;
  method?: string;
  path?: string;
  body?: Buffer;
  master?: Buffer;
  protocol?: string;
}

/// Подписанные заголовки через ОБЩУЮ функцию модуля (так будет делать и
/// симулятор). Независимая проверка вектора лежит в контрактном тесте.
export function signedHeaders(opts: SignedHeaderOptions = {}) {
  const slug = opts.slug ?? SLUG;
  const generation = opts.generation ?? 1;
  const keyId = formatKeyId(slug, generation);
  const timestamp = String(Math.floor((opts.nowMs ?? Date.now()) / 1000));
  const nonce = opts.nonce ?? freshNonce();
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/bridge/v1/events';
  const body = opts.body ?? Buffer.alloc(0);
  const key = deriveServerKey(opts.master ?? TEST_MASTER, slug, generation);
  const signature = signRequest(key, {
    keyId,
    timestamp,
    nonce,
    method,
    path,
    body,
  });
  return {
    'x-twomc-key-id': keyId,
    'x-twomc-timestamp': timestamp,
    'x-twomc-nonce': nonce,
    'x-twomc-protocol': opts.protocol ?? '1',
    'x-twomc-signature': signature,
  };
}

export function batchBody(
  events: Array<Record<string, unknown>>,
  sentAt = new Date().toISOString(),
): Buffer {
  return Buffer.from(
    JSON.stringify({ schema: 'twomc.bridge.v1', sentAt, events }),
    'utf8',
  );
}

let eventCounter = 0;
export function eventId(): string {
  eventCounter += 1;
  return `0193f0a2-7c1e-7000-8000-${String(eventCounter).padStart(12, '0')}`;
}

export function punishmentData(over: Record<string, unknown> = {}) {
  return {
    kind: 'BAN',
    sourceId: '123',
    subjectUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
    subjectName: 'TestPlayer001',
    ipBan: false,
    reason: 'Причина без цветовых кодов',
    executor: { uuid: null, name: null, console: true },
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    until: null,
    removal: null,
    scope: '*',
    origin: 'survival',
    silent: false,
    template: null,
    ...over,
  };
}

export function makeEvent(
  type: string,
  data: Record<string, unknown>,
  over: Record<string, unknown> = {},
) {
  return {
    eventId: eventId(),
    type,
    serverId: SLUG,
    streamId: 'boot-0001',
    seq: 1,
    occurredAt: new Date().toISOString(),
    data,
    ...over,
  };
}
