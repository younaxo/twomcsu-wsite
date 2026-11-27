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
          expect(s.area).toBe(g === 'main' ? 'hotbar' : 'ender');
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
  it('беседы: один ЛС и одна группа, участники и тексты демо', () => {
    const names = new Set(DEMO_PLAYERS.map((p) => p.username));
    const typeCount = (t: string) =>
      DEMO_CONVERSATIONS.filter((c) => c.type === t).length;
    expect(typeCount('DIRECT')).toBe(1);
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
    expect(size('conversation')).toBe(2);
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
