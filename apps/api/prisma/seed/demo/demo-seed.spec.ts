import {
  DEMO_AUTHOR,
  DEMO_CONTENT_DISCLAIMER,
  DEMO_EVENT_DISCLAIMER,
  DEMO_EVENTS,
  DEMO_FORMS,
  DEMO_APPEALS,
  DEMO_NEWS,
  DEMO_PUNISHMENT_ACCOUNT,
  DEMO_PUNISHMENTS,
  DEMO_SETTINGS,
  DEMO_SERVERS,
  DEMO_TOPICS,
  buildDemoEventDates,
  buildDemoEventRow,
  buildDemoProducts,
  buildDemoPunishmentRow,
  buildDemoSyncState,
  buildDemoTopicRow,
  demoAuthorTag,
  demoEscapeToHtml,
  demoPunishmentSourceId,
} from './data';
import {
  DEMO_CHAT_CHANNEL,
  DEMO_CHAT_MESSAGES,
  DEMO_CONVERSATIONS,
  DEMO_FRIENDSHIPS,
  DEMO_PLAYERS,
  DEMO_PROFILE_COMMENTS,
  buildDemoInventorySlots,
  buildDemoInventoryRow,
  buildDemoStatsRow,
  demoDirectKey,
  demoPlayerEmail,
  demoPlayerTag,
  demoSlotsHash,
} from './social';
import { seedDemoPunishmentLinks, seedDemoSocial } from './social-seed';
import {
  STAND_PLAYER_UUID,
  STAND_PUNISHMENTS,
  seedDemoStandPlayer,
} from './stand-player';
import {
  assertDemoSeedAllowed,
  assertDemoUserNotForeign,
  demoSeedRefusals,
  isLocalDatabaseUrl,
} from './guard';
import { demoFieldId, demoResponseId } from './keys';
import { AREA_SIZE } from '../../../src/modules/inventory/inventory-limits';
import { parseItem } from '../../../src/modules/inventory/inventory-normalize';
import {
  DEMO_ORDERS,
  DEMO_WALLET_OPS,
  demoWalletTotal,
  seedDemoWalletAndOrders,
} from './wallet-orders-seed';

const ok = {
  NODE_ENV: 'development',
  SEED_DEMO: '1',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};

describe('demo seed guard', () => {
  it('разрешает development + SEED_DEMO=1 + localhost', () => {
    expect(demoSeedRefusals(ok)).toEqual([]);
    expect(() => assertDemoSeedAllowed(ok)).not.toThrow();
    expect(
      demoSeedRefusals({ ...ok, DATABASE_URL: 'postgresql://x@127.0.0.1/db' }),
    ).toEqual([]);
  });
  it.each([undefined, '', 'production', 'test'])(
    'отказ при NODE_ENV=%p',
    (v) => {
      expect(demoSeedRefusals({ ...ok, NODE_ENV: v })).toHaveLength(1);
    },
  );
  it('отказ без SEED_DEMO=1', () => {
    expect(demoSeedRefusals({ ...ok, SEED_DEMO: undefined })).toHaveLength(1);
    expect(demoSeedRefusals({ ...ok, SEED_DEMO: 'true' })).toHaveLength(1);
  });
  it('отказ при нелокальной или битой БД', () => {
    expect(isLocalDatabaseUrl('postgresql://u@db.example.com/x')).toBe(false);
    expect(isLocalDatabaseUrl('postgresql://u@localhost.evil.com/x')).toBe(
      false,
    );
    expect(isLocalDatabaseUrl('мусор')).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(() => assertDemoSeedAllowed({})).toThrow(/fail closed/);
  });
});

describe('demo seed data', () => {
  const products = buildDemoProducts();
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const monthly = (s: string): number =>
    bySlug.get(s)!.variants.find((v) => v.duration === 'MONTH_1')!.price;

  it('14 товаров с уникальными slug', () => {
    expect(products).toHaveLength(14);
    expect(bySlug.size).toBe(14);
  });
  it('цены twomc.su', () => {
    expect(
      [
        'polemizm',
        'svarog',
        'kratos',
        'apolon',
        'deimos',
        'ares',
        'gefest',
      ].map(monthly),
    ).toEqual([1499, 799, 599, 399, 299, 129, 39]);
    expect(
      [
        'case-donate',
        'case-title',
        'case-ruby',
        'unmute',
        'unban',
        'rubies',
        'battle-pass-premium',
      ].map((s) => bySlug.get(s)!.variants[0].price),
    ).toEqual([89, 19, 79, 89, 199, 1, 299]);
  });
  it('у каждого товара есть команда выдачи и вариант', () => {
    for (const p of products) {
      expect(p.gameCommands.length).toBeGreaterThan(0);
      expect(p.variants.length).toBeGreaterThan(0);
    }
  });
  it('наказания без IP и контактов', () => {
    expect(DEMO_PUNISHMENTS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_PUNISHMENTS.length).toBeLessThanOrEqual(8);
    for (const p of DEMO_PUNISHMENTS) {
      expect(`${p.reason} ${p.subjectName}`).not.toMatch(
        /\d+\.\d+\.\d+\.\d+|@|https?:/,
      );
    }
  });
  it('строки-зеркала: выдавший скрыт, без IP, id сдвинуты', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    for (const p of DEMO_PUNISHMENTS) {
      const row = buildDemoPunishmentRow(p, now);
      expect(row.issuerHidden).toBe(true);
      expect(row.ipBan).toBe(false);
      expect(row.rowHash).toHaveLength(64);
      expect(demoPunishmentSourceId(p.sourceId) >= 900_000_000n).toBe(true);
    }
    const ban = buildDemoPunishmentRow(DEMO_PUNISHMENTS[0], now);
    expect(ban.startedAt.getTime()).toBe(now.getTime() - 2 * 86_400_000);
  });
  it('состояние синхронизации: litebans, все виды, initialSyncDoneAt', () => {
    const now = new Date();
    const states = buildDemoSyncState(now);
    expect(states.map((s) => s.kind).sort()).toEqual([
      'BAN',
      'KICK',
      'MUTE',
      'WARN',
    ]);
    for (const s of states) {
      expect(s.source).toBe('litebans');
      expect(s.initialSyncDoneAt).toBe(now);
    }
  });
  it('состав остальных данных', () => {
    expect(DEMO_NEWS.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_NEWS.length).toBeLessThanOrEqual(5);
    expect(DEMO_FORMS.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_SERVERS.map((s) => s.name)).toContain('Анархия Новой Эры');
    expect(DEMO_SERVERS.some((s) => /NullCord/.test(s.name))).toBe(true);
  });
});

describe('demo seed guard: query params', () => {
  const base = 'postgresql://u:p@localhost:5432/db';
  it.each([
    '?host=evil.com',
    '?HOST=evil.com',
    '?hostaddr=1.2.3.4',
    '?socket=/tmp',
    '?foo=1',
  ])('rejects %s', (q) => expect(isLocalDatabaseUrl(base + q)).toBe(false));
  it('allows safe params', () => {
    expect(isLocalDatabaseUrl(base + '?schema=public')).toBe(true);
    expect(
      isLocalDatabaseUrl(
        base + '?schema=public&sslmode=disable&connection_limit=5',
      ),
    ).toBe(true);
  });
  it('rejects comma in host', () => {
    expect(
      isLocalDatabaseUrl('postgresql://u:p@localhost,evil.com:5432/db'),
    ).toBe(false);
  });
});

describe('demo seed form keys', () => {
  it('are stable and unique', () => {
    const ids = DEMO_FORMS.flatMap((f) =>
      f.fields.map((_, i) => demoFieldId(f.slug, i)),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(demoFieldId('a', 0)).toBe(demoFieldId('a', 0));
    const rs = DEMO_FORMS.map((f) => demoResponseId(f.slug));
    expect(new Set(rs).size).toBe(rs.length);
  });
});

describe('demo seed content: topics and events', () => {
  const count = (c: string) =>
    DEMO_TOPICS.filter((x) => x.category === c).length;
  it('3 правила, 4 FAQ, 1-2 информационные страницы', () => {
    expect(count('RULES')).toBe(3);
    expect(count('FAQ')).toBe(4);
    expect(count('INFORMATION')).toBeGreaterThanOrEqual(1);
    expect(count('INFORMATION')).toBeLessThanOrEqual(2);
  });
  it('slug уникальны, заголовки с префиксом, в теле дисклеймер', () => {
    const all = [...DEMO_TOPICS, ...DEMO_EVENTS];
    expect(new Set(all.map((x) => x.slug)).size).toBe(all.length);
    for (const t of DEMO_TOPICS) {
      expect(t.title.startsWith('[Демо] ')).toBe(true);
      expect(t.body).toContain(DEMO_CONTENT_DISCLAIMER);
    }
    for (const e of DEMO_EVENTS) {
      expect(e.title.startsWith('[Демо] ')).toBe(true);
      expect(e.description).toContain(DEMO_EVENT_DISCLAIMER);
      expect(e.description).not.toContain('правил');
    }
  });
  it('2 события: одно будущее, одно прошедшее', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const [a, b] = DEMO_EVENTS.map((e) => buildDemoEventDates(e, now));
    expect(DEMO_EVENTS).toHaveLength(2);
    expect(a.startsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(b.endsAt.getTime()).toBeLessThan(now.getTime());
    expect(DEMO_EVENTS[0].status).toBe('PUBLISHED');
    expect(DEMO_EVENTS[1].status).toBe('PUBLISHED');
  });
  it('видимость: каждая запись проходит условия публичной выдачи', () => {
    const now = new Date();
    for (const t of DEMO_TOPICS) {
      const row = buildDemoTopicRow(t);
      expect(row.isActive).toBe(true);
      expect(row.visibility).toBe('PUBLIC');
    }
    for (const e of DEMO_EVENTS) {
      const row = buildDemoEventRow(e, now);
      expect(row.status).toBe('PUBLISHED');
      expect(row.visibility).toBe('PUBLIC');
    }
  });
  it('экранирование HTML', () => {
    expect(demoEscapeToHtml('<a>&\nb')).toBe('&lt;a&gt;&amp;<br>b');
  });
});

describe('demo seed author', () => {
  it('отдельный пользователь demo_system без входа', () => {
    expect(DEMO_AUTHOR.username).toBe('demo_system');
    expect(DEMO_AUTHOR.username.length).toBeLessThanOrEqual(16);
    expect(DEMO_AUTHOR.email).toBe('demo-system@example.invalid');
    expect(DEMO_AUTHOR.password.startsWith('$2')).toBe(false);
    expect(demoAuthorTag()).toBe('demo_system#0000');
  });
});

describe('demo seed social data', () => {
  it('вымышленные ники, почта .invalid, уникальность, длина', () => {
    const names = DEMO_PLAYERS.map((p) => p.username);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/^demo_[a-z]+$/);
      expect(n.length).toBeLessThanOrEqual(16);
      expect(demoPlayerEmail(n)).toMatch(/^demo-[a-z]+@example\.invalid$/);
      expect(demoPlayerTag(n)).toBe(`${n}#0000`);
    }
  });
  it('статистика непустая, K/D согласован', () => {
    for (const p of DEMO_PLAYERS) {
      const row = buildDemoStatsRow(p);
      expect(row.playTime).toBeGreaterThan(0);
      expect(row.kills + row.deaths).toBeGreaterThan(0);
      expect(row.killDeathRatio).toBeCloseTo(row.kills / row.deaths, 2);
    }
  });
  it('инвентарь: допустимые области/id, хеш стабилен, без приватных полей', () => {
    for (const p of DEMO_PLAYERS) {
      for (const g of ['main', 'ender'] as const) {
        const slots = buildDemoInventorySlots(p, g);
        for (const s of slots) {
          expect(
            g === 'main'
              ? ['hotbar', 'main', 'armor', 'offhand']
              : ['ender'],
          ).toContain(s.area);
          expect(s.slot).toBeGreaterThanOrEqual(0);
          expect(s.item.id).toMatch(/^[a-z0-9_.-]+:[a-z0-9_./-]+$/);
          expect(s.item.count).toBeGreaterThanOrEqual(1);
          expect(s.item.count).toBeLessThanOrEqual(99);
        }
        const row = buildDemoInventoryRow(p, g, new Date(0));
        expect(row.slotCount).toBe(slots.length);
        expect(row.contentHash).toBe(demoSlotsHash(slots));
        expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
  it('дружбы и комментарии ссылаются на демо-игроков', () => {
    const names = new Set(DEMO_PLAYERS.map((p) => p.username));
    const pairs = new Set<string>();
    for (const [a, b] of DEMO_FRIENDSHIPS) {
      expect(names.has(a) && names.has(b) && a !== b).toBe(true);
      pairs.add([a, b].sort().join(':'));
    }
    expect(pairs.size).toBe(DEMO_FRIENDSHIPS.length);
    const ids = new Set(DEMO_PROFILE_COMMENTS.map((c) => c.id));
    expect(ids.size).toBe(DEMO_PROFILE_COMMENTS.length);
    for (const c of DEMO_PROFILE_COMMENTS) {
      expect(names.has(c.profile) && names.has(c.author)).toBe(true);
      expect(c.text.startsWith('[Демо]')).toBe(true);
      if (c.parentId) expect(ids.has(c.parentId)).toBe(true);
    }
  });
  it('беседы: два ЛС и одна группа, участники и тексты демо', () => {
    const names = new Set(DEMO_PLAYERS.map((p) => p.username));
    const typeCount = (t: string) =>
      DEMO_CONVERSATIONS.filter((c) => c.type === t).length;
    expect(typeCount('DIRECT')).toBe(2);
    expect(typeCount('GROUP')).toBe(1);
    const msgIds = new Set<string>();
    for (const c of DEMO_CONVERSATIONS) {
      if (c.type === 'DIRECT') expect(c.members).toHaveLength(2);
      else expect(c.members.length).toBeGreaterThan(2);
      expect(c.members).toContain(c.owner);
      for (const m of c.messages) {
        expect(c.members).toContain(m.sender);
        expect(names.has(m.sender)).toBe(true);
        expect(m.text.startsWith('[Демо]')).toBe(true);
        msgIds.add(m.id);
      }
    }
    expect(msgIds.size).toBe(
      DEMO_CONVERSATIONS.reduce((n, c) => n + c.messages.length, 0),
    );
    expect(demoDirectKey('b', 'a')).toBe('a:b');
  });
});

/// Простая in-memory подмена Prisma: upsert по сериализованному `where`.
const keyOf = (w: unknown): string =>
  JSON.stringify(w, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

function fakePrisma() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  let seq = 0;
  const calls: string[] = [];
  const model = (name: string) => ({
    findUnique: (args: { where: Record<string, unknown> }) => {
      calls.push(`${name}.findUnique`);
      return Promise.resolve(
        tables.get(name)?.get(keyOf(args.where)) ?? null,
      );
    },
    findFirst: (args: { where: Record<string, unknown> }) => {
      calls.push(`${name}.findFirst`);
      const hit = [...(tables.get(name)?.values() ?? [])].find((r) =>
        Object.entries(args.where).every(([k, v]) => r[k] === v),
      );
      return Promise.resolve(hit ?? null);
    },
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      calls.push(`${name}.upsert`);
      const t = tables.get(name) ?? new Map();
      tables.set(name, t);
      const key = keyOf(args.where);
      const prev = t.get(key);
      const row = prev
        ? { ...prev, ...args.update }
        : { id: (args.create.id as string) ?? `gen-${++seq}`, ...args.create };
      t.set(key, row);
      return Promise.resolve(row);
    },
  });
  const prisma = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return undefined;
        return model(prop);
      },
    },
  );
  return { prisma, tables, calls };
}

describe('seedDemoSocial (in-memory Prisma)', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, ok);
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });
  it('идемпотентен: повтор не добавляет строк, трогает только demo_*', async () => {
    const { prisma, tables, calls } = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await seedDemoSocial(db, 'pos-1');
    const sizes1 = [...tables].map(([k, v]) => [k, v.size]);
    await seedDemoSocial(db, 'pos-1');
    const sizes2 = [...tables].map(([k, v]) => [k, v.size]);
    expect(sizes2).toEqual(sizes1);
    const size = (n: string) => tables.get(n)?.size;
    expect(size('user')).toBe(DEMO_PLAYERS.length);
    expect(size('playerStatistics')).toBe(DEMO_PLAYERS.length);
    expect(size('playerInventory')).toBe(DEMO_PLAYERS.length * 2);
    expect(size('friendship')).toBe(DEMO_FRIENDSHIPS.length);
    expect(size('conversation')).toBe(DEMO_CONVERSATIONS.length);
    expect(size('profileComment')).toBe(DEMO_PROFILE_COMMENTS.length);
    // Только upsert и чтение для проверки владения: ни delete/update.
    expect(new Set(calls.map((c) => c.split('.')[1]))).toEqual(
      new Set(['upsert', 'findUnique']),
    );
    // Приватность инвентаря не создаётся (нет строки = приватно).
    expect(tables.has('inventoryPrivacy')).toBe(false);
    // Админов/ролей/2FA нет.
    for (const u of tables.get('user')!.values()) {
      expect(String(u.username)).toMatch(/^demo_/);
      expect(u.twoFactorEnabled).toBeUndefined();
      expect(String(u.password).startsWith('$2')).toBe(false);
    }
    expect(tables.has('userRole')).toBe(false);
  });
});

describe('seedDemoSocial: защита и чужие пользователи', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it.each([
    { ...ok, NODE_ENV: 'production' },
    { ...ok, NODE_ENV: undefined },
    { ...ok, SEED_DEMO: undefined },
    { ...ok, DATABASE_URL: 'postgresql://u:p@db.example.com:5432/x' },
  ])('прямой вызов без разрешённого окружения отклоняется, БД не трогается: %j', async (env) => {
    process.env = { ...savedEnv, ...env } as NodeJS.ProcessEnv;
    if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
    if (env.SEED_DEMO === undefined) delete process.env.SEED_DEMO;
    const { prisma, calls } = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(seedDemoSocial(prisma as any, 'pos-1')).rejects.toThrow(
      /fail closed/,
    );
    expect(calls).toEqual([]);
  });

  it('чужой пользователь с ником demo_*: сид прерван, ничего не записано', async () => {
    Object.assign(process.env, ok);
    const { prisma, tables, calls } = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const foreign = DEMO_PLAYERS[2];
    tables.set(
      'user',
      new Map([
        [
          JSON.stringify({ username: foreign.username }),
          { id: 'real-1', username: foreign.username, email: 'real@mail.test' },
        ],
      ]),
    );
    await expect(seedDemoSocial(db, 'pos-1')).rejects.toThrow(
      new RegExp(foreign.username),
    );
    expect(calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
    expect(
      tables.get('user')!.get(JSON.stringify({ username: foreign.username })),
    ).toEqual({ id: 'real-1', username: foreign.username, email: 'real@mail.test' });
  });

  it('assertDemoUserNotForeign: нет пользователя или свой email — проходит; demo_system с чужим email — ошибка', async () => {
    const mk = (email: string | null) => ({
      user: { findUnique: async () => (email ? { email } : null) },
    });
    await expect(
      assertDemoUserNotForeign(mk(null), DEMO_AUTHOR.username, DEMO_AUTHOR.email),
    ).resolves.toBeUndefined();
    await expect(
      assertDemoUserNotForeign(mk(DEMO_AUTHOR.email), DEMO_AUTHOR.username, DEMO_AUTHOR.email),
    ).resolves.toBeUndefined();
    await expect(
      assertDemoUserNotForeign(mk('x@y.z'), DEMO_AUTHOR.username, DEMO_AUTHOR.email),
    ).rejects.toThrow(/demo_system/);
  });
});

describe('demo: настройки, «Мои наказания», обжалования', () => {
  it('настройки: статистика и магазин включены, исполнители выдачи выключены', () => {
    expect(DEMO_SETTINGS['stats.public.enabled']).toBe('true');
    expect(DEMO_SETTINGS['store.delivery.enabled']).toBe('true');
    expect(DEMO_SETTINGS['store.delivery.executor.command.enabled']).toBe('false');
    expect(DEMO_SETTINGS['store.delivery.executor.bridge.enabled']).toBe('false');
    expect(DEMO_SETTINGS).not.toHaveProperty('punishments.paidRemoval');
  });
  it('аккаунт: валидный uuid версии 4 (не офлайн), демо-игрок из списка', () => {
    const { uuid, name, username } = DEMO_PUNISHMENT_ACCOUNT;
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid.charAt(14)).not.toBe('3');
    expect(name.length).toBeLessThanOrEqual(16);
    expect(DEMO_PLAYERS.map((p) => p.username)).toContain(username);
  });
  it('subjectUuid у BAN активного, MUTE истёкшего и WARN; в строке зеркала', () => {
    const mine = DEMO_PUNISHMENTS.filter((p) => p.subjectUuid);
    expect(mine.map((p) => [p.kind, p.status]).sort()).toEqual([
      ['BAN', 'ACTIVE'],
      ['MUTE', 'EXPIRED'],
      ['WARN', 'EXPIRED'],
    ]);
    const row = buildDemoPunishmentRow(mine[0], new Date());
    expect(row.subjectUuid).toBe(DEMO_PUNISHMENT_ACCOUNT.uuid);
    const other = DEMO_PUNISHMENTS.find((p) => !p.subjectUuid)!;
    expect(buildDemoPunishmentRow(other, new Date()).subjectUuid).toBeNull();
    const ids = DEMO_PUNISHMENTS.map((p) => `${p.kind}:${p.sourceId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('обжалования: одно на рассмотрении, одно отклонённое, ссылаются на существующее наказание', () => {
    expect(DEMO_APPEALS.map((a) => a.status).sort()).toEqual(['IN_REVIEW', 'REJECTED']);
    for (const a of DEMO_APPEALS) {
      const p = DEMO_PUNISHMENTS.find((x) => x.sourceId === a.punishmentSourceId);
      expect(p?.kind).toBe(a.punishmentKind);
      expect(p?.subjectUuid).toBe(DEMO_PUNISHMENT_ACCOUNT.uuid);
      expect(a.description.startsWith('[Демо]')).toBe(true);
    }
    expect(DEMO_APPEALS.filter((a) => a.status === 'IN_REVIEW')).toHaveLength(1);
  });
});

describe('seedDemoPunishmentLinks (in-memory Prisma)', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, ok);
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });
  const prepare = () => {
    const f = fakePrisma();
    f.tables.set(
      'user',
      new Map([
        [
          JSON.stringify({ username: DEMO_PUNISHMENT_ACCOUNT.username }),
          {
            id: 'u-ember',
            username: DEMO_PUNISHMENT_ACCOUNT.username,
            email: demoPlayerEmail(DEMO_PUNISHMENT_ACCOUNT.username),
          },
        ],
      ]),
    );
    const mp = new Map<string, Record<string, unknown>>();
    for (const a of DEMO_APPEALS) {
      const key = JSON.stringify({
        source_sourceScope_kind_sourceId: {
          source: 'litebans',
          sourceScope: 'default',
          kind: a.punishmentKind,
          sourceId: demoPunishmentSourceId(a.punishmentSourceId),
        },
      }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      mp.set(key, { id: `mp-${a.punishmentSourceId}` });
    }
    f.tables.set('minecraftPunishment', mp);
    return f;
  };

  it('создаёт аккаунт и обращения, повтор не дублирует', async () => {
    const { prisma, tables } = prepare();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    await seedDemoPunishmentLinks(db);
    await seedDemoPunishmentLinks(db);
    expect(tables.get('minecraftAccount')!.size).toBe(1);
    const acc = [...tables.get('minecraftAccount')!.values()][0];
    expect(acc).toMatchObject({
      userId: 'u-ember',
      uuid: DEMO_PUNISHMENT_ACCOUNT.uuid,
      name: DEMO_PUNISHMENT_ACCOUNT.name,
    });
    const reports = [...tables.get('report')!.values()];
    expect(reports).toHaveLength(DEMO_APPEALS.length);
    for (const r of reports) {
      expect(r).toMatchObject({
        type: 'PUNISHMENT_APPEAL',
        authorId: 'u-ember',
        appealedMinecraftPunishmentId: 'mp-9001',
      });
    }
    expect(reports.map((r) => r.status).sort()).toEqual(['IN_REVIEW', 'REJECTED']);
  });

  it('без разрешённого окружения отклоняется до обращения к БД', async () => {
    process.env.NODE_ENV = 'production';
    const { prisma, calls } = prepare();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(seedDemoPunishmentLinks(prisma as any)).rejects.toThrow(/fail closed/);
    expect(calls).toEqual([]);
  });

  it('чужой пользователь demo_ember: ничего не записано', async () => {
    const { prisma, tables, calls } = prepare();
    tables.get('user')!.set(
      JSON.stringify({ username: DEMO_PUNISHMENT_ACCOUNT.username }),
      { id: 'real', username: DEMO_PUNISHMENT_ACCOUNT.username, email: 'real@mail.test' },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(seedDemoPunishmentLinks(prisma as any)).rejects.toThrow(/demo_ember/);
    expect(calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
  });
});

describe('seedDemoStandPlayer (in-memory Prisma)', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, ok);
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    jest.restoreAllMocks();
  });
  const userKey = (n: string) => JSON.stringify({ username: n });
  const prepare = (username?: string, existingAccount?: Record<string, unknown>) => {
    const f = fakePrisma();
    if (username) {
      f.tables.set(
        'user',
        new Map([[userKey(username), { id: 'u-stand', username }]]),
      );
    }
    if (existingAccount) {
      f.tables.set(
        'minecraftAccount',
        new Map([[JSON.stringify({ userId: 'u-stand' }), existingAccount]]),
      );
    }
    return f;
  };
  const run = (f: ReturnType<typeof fakePrisma>, name?: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    seedDemoStandPlayer(f.prisma as any, {
      ...ok,
      ...(name ? { DEMO_STAND_PLAYER_USERNAME: name } : {}),
    } as NodeJS.ProcessEnv);

  it('env не задана: ничего не пишется', async () => {
    const f = prepare('tester');
    await run(f);
    expect(f.calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
  });

  it('пользователя нет: предупреждение без имени, без записей', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = prepare();
    await run(f, 'secretname');
    expect(f.calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain('secretname');
  });

  it('demo_*: пропуск', async () => {
    const f = prepare('demo_ember');
    await run(f, 'demo_ember');
    expect(f.calls).toEqual([]);
  });

  it('создаёт аккаунт, 3 наказания и одно обжалование; повтор не дублирует', async () => {
    const f = prepare('tester');
    await run(f, 'tester');
    await run(f, 'tester');
    const acc = [...f.tables.get('minecraftAccount')!.values()];
    expect(acc).toHaveLength(1);
    expect(acc[0]).toMatchObject({
      userId: 'u-stand',
      uuid: STAND_PLAYER_UUID,
      name: 'StandPlayer',
    });
    expect(STAND_PLAYER_UUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(STAND_PLAYER_UUID).not.toBe(DEMO_PUNISHMENT_ACCOUNT.uuid);
    const pun = [...f.tables.get('minecraftPunishment')!.values()];
    expect(pun.map((p) => [p.kind, p.status]).sort()).toEqual([
      ['BAN', 'ACTIVE'],
      ['MUTE', 'EXPIRED'],
      ['WARN', 'EXPIRED'],
    ]);
    for (const p of pun) {
      expect(p).toMatchObject({
        source: 'litebans',
        subjectUuid: STAND_PLAYER_UUID,
        issuerHidden: true,
        ipBan: false,
      });
    }
    const reports = [...f.tables.get('report')!.values()];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      type: 'PUNISHMENT_APPEAL',
      status: 'IN_REVIEW',
      authorId: 'u-stand',
    });
    const ban = pun.find((p) => p.kind === 'BAN')!;
    expect(reports[0].appealedMinecraftPunishmentId).toBe(ban.id);
    // Данные пользователя не трогаются.
    expect(f.tables.has('userRole')).toBe(false);
    expect(f.calls.some((c) => c.startsWith('user.upsert'))).toBe(false);
    const ids = STAND_PUNISHMENTS.map((p) => p.sourceId);
    for (const d of DEMO_PUNISHMENTS) expect(ids).not.toContain(d.sourceId);
  });

  it('уже есть настоящий MinecraftAccount: пропуск без наказаний и обжалования', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const real = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const f = prepare('tester', { id: 'a1', userId: 'u-stand', uuid: real, name: 'Existing' });
    await run(f, 'tester');
    expect(f.calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
    expect(f.tables.has('minecraftPunishment')).toBe(false);
    expect(f.tables.has('report')).toBe(false);
    expect(String(warn.mock.calls[0][0])).not.toContain('tester');
  });

  it('аккаунт уже с фиктивным uuid: наказания создаются', async () => {
    const f = prepare('tester', { id: 'a1', userId: 'u-stand', uuid: STAND_PLAYER_UUID, name: 'StandPlayer' });
    await run(f, 'tester');
    expect(f.tables.get('minecraftPunishment')!.size).toBe(3);
  });

  it('роли персонала: пропуск без записей', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = prepare('tester');
    f.tables.set('userRole', new Map([['k', { userId: 'u-stand', roleId: 'r1' }]]));
    await run(f, 'tester');
    expect(f.calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
  });

  it('повтор не возвращает обработанное обжалование в IN_REVIEW', async () => {
    const f = prepare('tester');
    await run(f, 'tester');
    const rep = [...f.tables.get('report')!.values()][0];
    rep.status = 'RESOLVED';
    rep.verdict = 'ACCEPTED';
    await run(f, 'tester');
    expect([...f.tables.get('report')!.values()][0]).toMatchObject({ status: 'RESOLVED', verdict: 'ACCEPTED' });
  });

  it('без разрешённого окружения отклоняется', async () => {
    const f = prepare('tester');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seedDemoStandPlayer(f.prisma as any, {
        ...ok,
        NODE_ENV: 'production',
        DEMO_STAND_PLAYER_USERNAME: 'tester',
      } as NodeJS.ProcessEnv),
    ).rejects.toThrow(/fail closed/);
    expect(f.calls).toEqual([]);
  });
});

/// Подмена Prisma для сида кошелька/заказов: ведёт журнал и баланс так же, как
/// WalletLedgerService ожидает от БД (строка кошелька, FOR UPDATE, aggregate).
/* eslint-disable @typescript-eslint/no-explicit-any */
function walletFakePrisma() {
  const base = fakePrisma();
  const users = new Map<
    string,
    { id: string; username: string; email: string }
  >();
  for (const p of DEMO_PLAYERS) {
    users.set(p.username, {
      id: `id-${p.username}`,
      username: p.username,
      email: demoPlayerEmail(p.username),
    });
  }
  users.set(DEMO_AUTHOR.username, {
    id: `id-${DEMO_AUTHOR.username}`,
    username: DEMO_AUTHOR.username,
    email: DEMO_AUTHOR.email,
  });
  const ledger: Array<Record<string, any>> = [];
  const state: { balance?: bigint } = {};
  const overrides: Record<string, any> = {
    user: {
      findUnique: ({ where }: any) =>
        Promise.resolve(users.get(where.username) ?? null),
    },
    product: {
      findUnique: ({ where }: any) =>
        Promise.resolve({ id: `p-${where.slug}` }),
    },
    productVariant: {
      findUnique: ({ where }: any) =>
        Promise.resolve({
          id: `v-${where.productId_duration.productId}`,
          price: where.productId_duration.productId === 'p-rubies' ? 1 : 19,
        }),
    },
    walletLedgerEntry: {
      findUnique: ({ where }: any) =>
        Promise.resolve(
          ledger.find((e) => e.idempotencyKey === where.idempotencyKey) ??
            null,
        ),
      create: ({ data }: any) => {
        const row = { id: `le-${ledger.length + 1}`, ...data };
        ledger.push(row);
        return Promise.resolve(row);
      },
      aggregate: ({ where }: any) =>
        Promise.resolve({
          _sum: {
            amount: ledger
              .filter((e) => e.userId === where.userId)
              .reduce((s, e) => s + e.amount, 0n),
          },
        }),
    },
    wallet: {
      findUnique: () =>
        Promise.resolve(
          state.balance === undefined ? null : { balance: state.balance },
        ),
    },
  };
  const prisma: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return undefined;
        if (prop === '$transaction') return (fn: any) => fn(prisma);
        if (prop === '$executeRaw') {
          return (strings: TemplateStringsArray, ...vals: unknown[]) => {
            const text = strings.join('?');
            if (text.includes('INSERT INTO wallets')) state.balance ??= 0n;
            if (text.includes('UPDATE wallets'))
              state.balance = vals[0] as bigint;
            return Promise.resolve(1);
          };
        }
        if (prop === '$queryRaw') {
          return () =>
            Promise.resolve(
              state.balance === undefined ? [] : [{ balance: state.balance }],
            );
        }
        if (prop in overrides) return overrides[prop];
        return (base.prisma as any)[prop];
      },
    },
  );
  return { prisma, base, ledger, state, users };
}

describe('seedDemoWalletAndOrders (in-memory Prisma)', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, ok);
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    jest.restoreAllMocks();
  });

  it('баланс = сумма операций журнала, balanceAfter ведётся нарастающим итогом', async () => {
    const f = walletFakePrisma();
    await seedDemoWalletAndOrders(f.prisma);
    expect(f.ledger).toHaveLength(DEMO_WALLET_OPS.length);
    const sum = f.ledger.reduce((s, e) => s + e.amount, 0n);
    expect(f.state.balance).toBe(sum);
    expect(sum).toBe(demoWalletTotal());
    expect(sum).toBeGreaterThan(0n);
    let running = 0n;
    for (const e of f.ledger) {
      running += e.amount;
      expect(e.balanceAfter).toBe(running);
      expect(e.balanceAfter).toBeGreaterThanOrEqual(0n);
    }
  });

  it('только пополнения и админская корректировка: трат и передач нет', async () => {
    const f = walletFakePrisma();
    await seedDemoWalletAndOrders(f.prisma);
    for (const e of f.ledger) {
      expect(['PURCHASE', 'ADMIN_ADJUST']).toContain(e.kind);
      if (e.kind === 'PURCHASE') expect(e.amount).toBeGreaterThan(0n);
    }
    for (const op of DEMO_WALLET_OPS) {
      expect(['PURCHASE', 'ADMIN_ADJUST']).toContain(op.kind);
    }
    expect(new Set(DEMO_WALLET_OPS.map((o) => o.key)).size).toBe(
      DEMO_WALLET_OPS.length,
    );
  });

  it('покупки рубинов согласованы с заказами (1 ₽ = 1 рубин, ключ по позиции)', () => {
    for (const op of DEMO_WALLET_OPS.filter((o) => o.kind === 'PURCHASE')) {
      expect(op.order?.productSlug).toBe('rubies');
      expect(op.amount).toBe(BigInt(op.order!.quantity));
      expect(op.key).toBe(`purchase:${op.order!.itemId}:1`);
    }
  });

  it('идемпотентен: повтор не добавляет проводок, заказов и сообщений', async () => {
    const f = walletFakePrisma();
    await seedDemoWalletAndOrders(f.prisma);
    const sizes1 = [...f.base.tables].map(([k, v]) => [k, v.size]);
    const balance1 = f.state.balance;
    const ledger1 = f.ledger.length;
    const summary = await seedDemoWalletAndOrders(f.prisma);
    expect(f.ledger.length).toBe(ledger1);
    expect(f.state.balance).toBe(balance1);
    expect([...f.base.tables].map(([k, v]) => [k, v.size])).toEqual(sizes1);
    expect(summary).toContain('новых 0');
    const size = (n: string) => f.base.tables.get(n)?.size;
    expect(size('order')).toBe(DEMO_ORDERS.length);
    expect(size('orderItem')).toBe(DEMO_ORDERS.length);
    expect(size('deliveryTask')).toBe(DEMO_ORDERS.length);
    expect(size('chatMessage')).toBe(DEMO_CHAT_MESSAGES.length);
    expect(size('chatChannel')).toBe(1);
  });

  it('затрагивает только demo_*: заказы, проводки и чат принадлежат демо-пользователям', async () => {
    const f = walletFakePrisma();
    await seedDemoWalletAndOrders(f.prisma);
    const demoIds = new Set([...f.users.values()].map((u) => u.id));
    for (const e of f.ledger) {
      expect(e.userId).toBe('id-demo_ember');
      if (e.actorId) expect(demoIds.has(e.actorId)).toBe(true);
    }
    for (const o of f.base.tables.get('order')!.values()) {
      expect(o.userId).toBe('id-demo_ember');
      expect(o.status).toBe('COMPLETED');
      expect(o.paymentProvider).toBe('test');
      expect(o.paymentWebhookVerifiedAt).toBeUndefined();
    }
    for (const m of f.base.tables.get('chatMessage')!.values()) {
      expect(demoIds.has(m.authorId as string)).toBe(true);
    }
    for (const t of f.base.tables.get('deliveryTask')!.values()) {
      expect(['wallet', 'manual']).toContain(t.executor);
    }
  });

  it('чужой пользователь demo_*: сид прерван до любой записи', async () => {
    const f = walletFakePrisma();
    f.users.set('demo_ember', {
      id: 'real-1',
      username: 'demo_ember',
      email: 'real@mail.test',
    });
    await expect(seedDemoWalletAndOrders(f.prisma)).rejects.toThrow(
      /demo_ember/,
    );
    expect(f.ledger).toEqual([]);
    expect(f.state.balance).toBeUndefined();
    expect(f.base.calls.filter((c) => c.endsWith('.upsert'))).toEqual([]);
  });

  it('баланс уже расходится с журналом: кошелёк не трогается', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = walletFakePrisma();
    f.state.balance = 10n;
    const summary = await seedDemoWalletAndOrders(f.prisma);
    expect(f.ledger).toEqual([]);
    expect(f.state.balance).toBe(10n);
    expect(summary).toContain('расхождение');
  });

  it.each([
    { ...ok, NODE_ENV: 'production' },
    { ...ok, SEED_DEMO: '0' },
    { ...ok, DATABASE_URL: 'postgresql://u:p@db.example.com:5432/x' },
  ])(
    'без разрешённого окружения отклоняется, БД не трогается: %j',
    async (env) => {
      process.env = { ...savedEnv, ...env } as NodeJS.ProcessEnv;
      const f = walletFakePrisma();
      await expect(seedDemoWalletAndOrders(f.prisma)).rejects.toThrow(
        /fail closed/,
      );
      expect(f.base.calls).toEqual([]);
      expect(f.ledger).toEqual([]);
    },
  );
});

describe('демо-данные demo_ember: инвентарь, друзья, беседы', () => {
  const ember = DEMO_PLAYERS.find((p) => p.username === 'demo_ember')!;

  it('инвентарь проходит строгую проверку схемы API и разнообразен', () => {
    for (const g of ['main', 'ender'] as const) {
      const slots = buildDemoInventorySlots(ember, g);
      const seen = new Set<string>();
      for (const s of slots) {
        const key = `${s.area}:${s.slot}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(s.slot).toBeLessThan(AREA_SIZE[s.area]);
        expect(() => parseItem(s.item, key)).not.toThrow();
      }
    }
    const main = buildDemoInventorySlots(ember, 'main');
    const ender = buildDemoInventorySlots(ember, 'ender');
    const all = [...main, ...ender].map((s) => s.item);
    expect(new Set(all.map((i) => i.count)).size).toBeGreaterThan(5);
    expect(all.some((i) => (i.enchants?.length ?? 0) > 0)).toBe(true);
    expect(all.some((i) => i.name?.some((r) => r.color === 'gold'))).toBe(
      true,
    );
    expect(
      all.some((i) => i.name?.some((r) => r.color === 'light_purple')),
    ).toBe(true);
    expect(main.some((s) => s.area === 'armor')).toBe(true);
    expect(main.some((s) => s.area === 'offhand')).toBe(true);
  });

  it('друзья: не меньше 3, входящих заявок не меньше 2; ЛС: 2 у demo_ember', () => {
    const accepted = DEMO_FRIENDSHIPS.filter(
      ([a, b, s]) =>
        s === 'ACCEPTED' && (a === 'demo_ember' || b === 'demo_ember'),
    );
    const incoming = DEMO_FRIENDSHIPS.filter(
      ([, b, s]) => s === 'PENDING' && b === 'demo_ember',
    );
    expect(accepted.length).toBeGreaterThanOrEqual(3);
    expect(incoming.length).toBeGreaterThanOrEqual(2);
    const directs = DEMO_CONVERSATIONS.filter(
      (c) => c.type === 'DIRECT' && c.members.includes('demo_ember'),
    );
    expect(directs).toHaveLength(2);
    for (const c of directs)
      expect(c.messages.length).toBeGreaterThanOrEqual(3);
  });

  it('сообщения общего чата: только demo_*, тексты демо, id уникальны', () => {
    const names = new Set(DEMO_PLAYERS.map((p) => p.username));
    expect(DEMO_CHAT_MESSAGES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(DEMO_CHAT_MESSAGES.map((m) => m.id)).size).toBe(
      DEMO_CHAT_MESSAGES.length,
    );
    for (const m of DEMO_CHAT_MESSAGES) {
      expect(names.has(m.author)).toBe(true);
      expect(m.text.startsWith('[Демо]')).toBe(true);
    }
    expect(DEMO_CHAT_CHANNEL.slug.startsWith('demo-')).toBe(true);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/// Стенд с прошлыми демо-данными: сид не падает и не дублирует записи.
describe('демо-сид на стенде с прошлыми данными', () => {
  const savedEnv = { ...process.env };
  let warn: jest.SpyInstance;
  beforeEach(() => {
    Object.assign(process.env, ok);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    jest.restoreAllMocks();
  });

  /// Подмена с одной сломанной моделью/методом.
  const breaking = (prisma: any, model: string, method: string): any =>
    new Proxy(prisma, {
      get: (t, prop: string) =>
        prop === model
          ? { ...t[prop], [method]: () => Promise.reject(new Error('boom')) }
          : t[prop],
    });

  const socialFixture = () => {
    const f = fakePrisma();
    const users = new Map<string, Record<string, unknown>>();
    for (const p of DEMO_PLAYERS) {
      users.set(JSON.stringify({ username: p.username }), {
        id: `u-${p.username}`,
        username: p.username,
        email: demoPlayerEmail(p.username),
      });
    }
    f.tables.set('user', users);
    return f;
  };

  it('ЛС: существующая беседа по directKey используется, дубля и падения нет', async () => {
    const f = socialFixture();
    const direct = DEMO_CONVERSATIONS.find((c) => c.type === 'DIRECT')!;
    const key = demoDirectKey(`u-${direct.members[0]}`, `u-${direct.members[1]}`);
    f.tables.set(
      'conversation',
      new Map([
        [JSON.stringify({ directKey: key }), { id: 'legacy-conv', directKey: key }],
      ]),
    );
    await seedDemoSocial(f.prisma as any, 'pos-1');
    const convs = [...f.tables.get('conversation')!.values()];
    expect(new Set(convs.filter((c) => c.directKey === key).map((c) => c.id))).toEqual(new Set(['legacy-conv']));
    expect(convs.some((c) => c.id === direct.id)).toBe(false);
    const msgs = [...f.tables.get('directMessage')!.values()].filter((m) =>
      direct.messages.some((x) => x.id === m.id),
    );
    expect(msgs).toHaveLength(direct.messages.length);
    for (const m of msgs) expect(m.conversationId).toBe('legacy-conv');
  });

  it('дружба: пара уже есть в обратную сторону — вторая запись не создаётся', async () => {
    const f = socialFixture();
    const [a, b] = DEMO_FRIENDSHIPS[0];
    const rev = {
      requesterId_addresseeId: { requesterId: `u-${b}`, addresseeId: `u-${a}` },
    };
    f.tables.set(
      'friendship',
      new Map([[JSON.stringify(rev), { id: 'f-old', status: 'ACCEPTED' }]]),
    );
    await seedDemoSocial(f.prisma as any, 'pos-1');
    const fwd = JSON.stringify({
      requesterId_addresseeId: { requesterId: `u-${a}`, addresseeId: `u-${b}` },
    });
    expect(f.tables.get('friendship')!.has(fwd)).toBe(false);
    expect(f.tables.get('friendship')!.size).toBe(DEMO_FRIENDSHIPS.length);
  });

  it('сбой блока инвентаря: предупреждение, остальные блоки применены, итог в логе', async () => {
    const f = socialFixture();
    const summary = await seedDemoSocial(
      breaking(f.prisma, 'playerInventory', 'upsert'),
      'pos-1',
    );
    expect(summary).toContain('пропущено: инвентарь');
    expect(summary).toContain('применено: дружбы, беседы, комментарии профиля');
    expect(f.tables.get('conversation')!.size).toBe(DEMO_CONVERSATIONS.length);
    expect(String(warn.mock.calls[0][0])).toContain('инвентарь');
  });

  it('чат: канал demo-general создан не сидом — не изменён, сообщений нет, остальное применено', async () => {
    const f = walletFakePrisma();
    const foreign = { id: 'c1', name: 'Общий', description: 'чужое описание' };
    f.base.tables.set(
      'chatChannel',
      new Map([[JSON.stringify({ slug: DEMO_CHAT_CHANNEL.slug }), foreign]]),
    );
    const summary = await seedDemoWalletAndOrders(f.prisma);
    expect([...f.base.tables.get('chatChannel')!.values()]).toEqual([foreign]);
    expect(f.base.tables.has('chatMessage')).toBe(false);
    expect(summary).toContain('пропущено: чат');
    expect(f.base.tables.get('order')!.size).toBe(DEMO_ORDERS.length);
    expect(f.ledger).toHaveLength(DEMO_WALLET_OPS.length);
  });

  it('чат: демо-канал с изменённым именем не переименовывается (update пуст)', async () => {
    const f = walletFakePrisma();
    const mine = {
      id: 'c1',
      name: '[Демо] Переименован',
      description: DEMO_CHAT_CHANNEL.description,
    };
    f.base.tables.set(
      'chatChannel',
      new Map([[JSON.stringify({ slug: DEMO_CHAT_CHANNEL.slug }), mine]]),
    );
    await seedDemoWalletAndOrders(f.prisma);
    expect([...f.base.tables.get('chatChannel')!.values()][0].name).toBe(
      '[Демо] Переименован',
    );
    expect(f.base.tables.get('chatMessage')!.size).toBe(DEMO_CHAT_MESSAGES.length);
  });

  it('заказы: номер занят чужим заказом — блок пропущен целиком, кошелёк не тронут', async () => {
    const f = walletFakePrisma();
    const other = { id: 'x-1', orderNumber: DEMO_ORDERS[1].orderNumber, userId: 'someone-else' };
    f.base.tables.set(
      'order',
      new Map([[JSON.stringify({ orderNumber: other.orderNumber }), other]]),
    );
    const summary = await seedDemoWalletAndOrders(f.prisma);
    expect([...f.base.tables.get('order')!.values()]).toEqual([other]);
    expect(f.base.tables.has('orderItem')).toBe(false);
    expect(f.base.tables.has('deliveryTask')).toBe(false);
    expect(f.ledger).toEqual([]);
    expect(summary).toContain('пропущено: заказы, кошелёк');
    expect(summary).toContain('применено: чат');
    expect(f.base.tables.get('chatMessage')!.size).toBe(DEMO_CHAT_MESSAGES.length);
  });

  it('сбой записи чата не мешает заказам и кошельку', async () => {
    const f = walletFakePrisma();
    const summary = await seedDemoWalletAndOrders(
      breaking(f.prisma, 'chatMessage', 'upsert'),
    );
    expect(summary).toContain('пропущено: чат');
    expect(summary).toContain('применено: заказы, кошелёк');
    expect(f.ledger).toHaveLength(DEMO_WALLET_OPS.length);
  });
});
