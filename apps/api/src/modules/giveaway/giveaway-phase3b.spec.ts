import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { GiveawayAdminController } from './giveaway-admin.controller';
import { GiveawayConfig, readGiveawayConfig } from './giveaway.config';
import { ADMIN_SESSION_RETENTION_MS } from './giveaway.constants';
import {
  assignWinners,
  drawOrder,
  nextEligibleIndex,
  placesFor,
  revealOrder,
  snapshotHashOf,
  canonicalSnapshot,
  SnapshotEntry,
} from './giveaway-draw';
import { VECTOR_ENTRIES, VECTOR_SEED } from './giveaway-draw.fixtures';
import { sha256Hex } from './giveaway-crypto';
import { GiveawayPrizesService } from './giveaway-prizes.service';
import {
  loadPrizesConfig,
  parsePrizesConfig,
  resolvePrizesConfigPath,
} from './giveaway-prizes-config';
import { GiveawayStreamService } from './giveaway-stream.service';

const REPO_PRIZES = resolve(
  __dirname,
  '../../../../../giveaway/config/prizes.json',
);
const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const HASH = snapshotHashOf(canonicalSnapshot(VECTOR_ENTRIES));

function config(extra: Record<string, string> = {}): GiveawayConfig {
  const env: Record<string, string> = {
    GIVEAWAY_ENABLED: 'true',
    GIVEAWAY_MASTER_SECRET: SECRET,
    GIVEAWAY_DISCORD_CLIENT_ID: 'cid',
    GIVEAWAY_DISCORD_CLIENT_SECRET: 'csecret',
    GIVEAWAY_DISCORD_REDIRECT_URI: 'https://admin.giveaway.twomc.su/cb',
    GIVEAWAY_ADMIN_DISCORD_IDS: '111111111111111111',
    ...extra,
  };
  return readGiveawayConfig({ get: (k: string) => env[k] as never });
}

describe('призы из конфига (Q97)', () => {
  it('файл репозитория: 10 мест подряд, поля для эфира', () => {
    const list = loadPrizesConfig(REPO_PRIZES);
    expect(list).toHaveLength(10);
    expect(list.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(list[0]).toEqual({
      place: 1,
      title: 'Клавиатура AJAZZ AK820',
      description: 'Механическая клавиатура AJAZZ AK820 и кастомный титул.',
      image: 'keyboard-art.svg',
    });
  });

  it('fail closed: нет файла, не JSON, пропуск места, плохая картинка', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gw-prizes-'));
    try {
      expect(() => loadPrizesConfig(join(dir, 'none.json'))).toThrow(
        /читается/,
      );
      const bad = join(dir, 'bad.json');
      writeFileSync(bad, '{not json');
      expect(() => loadPrizesConfig(bad)).toThrow(/JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const p = (place: number, image = 'a.svg') => ({
      place,
      title: 'T',
      description: '',
      image,
    });
    expect(() => parsePrizesConfig({ prizes: [] })).toThrow();
    expect(() => parsePrizesConfig({ prizes: [p(1), p(3)] })).toThrow(/1\.\.N/);
    expect(() => parsePrizesConfig({ prizes: [p(1), p(1)] })).toThrow(/1\.\.N/);
    expect(() => parsePrizesConfig({ prizes: [p(1, '../x.svg')] })).toThrow();
    expect(() =>
      parsePrizesConfig({ prizes: [{ ...p(1), title: 'x'.repeat(81) }] }),
    ).toThrow();
    expect(
      parsePrizesConfig({ prizes: [p(2), p(1)] }).map((x) => x.place),
    ).toEqual([1, 2]);
  });

  it('путь: GIVEAWAY_PRIZES_CONFIG относительно cwd; по умолчанию - поиск вверх', () => {
    expect(resolvePrizesConfigPath('x/p.json', '/base')).toBe(
      resolve('/base', 'x/p.json'),
    );
    expect(config().admin.prizesConfigPath).toBeNull();
    expect(
      config({ GIVEAWAY_PRIZES_CONFIG: 'a/b.json' }).admin.prizesConfigPath,
    ).toBe('a/b.json');
    expect(resolvePrizesConfigPath(null, resolve(__dirname))).toBe(REPO_PRIZES);
  });

  it('сервис призов отдаёт места из конфига; админ-CRUD отключён', async () => {
    const list = loadPrizesConfig(REPO_PRIZES);
    const svc = new GiveawayPrizesService(
      {} as never,
      {} as never,
      config(),
      list,
    );
    const view = svc.configList();
    expect(view.locked).toBe(true);
    expect(view.source).toBe('config');
    expect(view.items).toHaveLength(10);
    const ordered = await svc.ordered();
    expect(ordered.map((o) => o.quantity)).toEqual(Array(10).fill(1));
    expect(
      placesFor(
        ordered.map((o) => ({
          name: o.name,
          quantity: o.quantity,
          imageFile: o.imageFile,
        })),
      ).map((x) => x.place),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const c = GiveawayAdminController.prototype;
    for (const m of ['createPrize', 'updatePrize', 'deletePrize'] as const) {
      expect(() => c[m].call(null as never)).toThrow(
        expect.objectContaining({
          response: { error: 'prizes_config_managed' },
        }),
      );
    }
  });
});

describe('правило «один приз на игрока», порядок 10 -> 1 (ADR-G003 п. 3.6-3.7)', () => {
  const order = drawOrder(VECTOR_ENTRIES, VECTOR_SEED, HASH);
  const places = placesFor(
    Array.from({ length: 10 }, (_, i) => ({
      name: `P${i + 1}`,
      quantity: 1,
      imageFile: null,
    })),
  );

  it('вектор: места 1..10 получают билеты перестановки подряд', () => {
    expect(order.map((e) => e.ticket)).toEqual([
      'K417',
      'B002',
      'W640',
      'A001',
      'P777',
      'H808',
      'M250',
      'Z999',
      'T100',
      'C333',
    ]);
    const a = assignWinners(order, places);
    expect(a.map((x) => [x.place.place, order[x.orderIndex].ticket])).toEqual(
      order.map((e, i) => [i + 1, e.ticket]),
    );
    expect(revealOrder(a.map((x) => x.place.place))).toEqual([
      10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it('вектор: повтор UUID пропускается (W640 принадлежит Alex), замена тоже его обходит', () => {
    const alex = VECTOR_ENTRIES[0].playerUuid;
    const dup: SnapshotEntry[] = order.map((e) =>
      e.ticket === 'W640' ? { ...e, playerUuid: alex } : e,
    );
    const a = assignWinners(dup, places.slice(0, 3));
    expect(a.map((x) => dup[x.orderIndex].ticket)).toEqual([
      'K417',
      'B002',
      'A001',
    ]);
    const used = new Set(a.map((x) => x.orderIndex));
    const blocked = new Set(a.map((x) => dup[x.orderIndex].playerUuid));
    // K417 дисквалифицирован (его UUID остаётся заблокированным): W640 (тот же UUID) пропущен
    expect(
      nextEligibleIndex(
        dup.map((e) => e.playerUuid),
        used,
        blocked,
      ),
    ).toBe(4);
    expect(dup[4].ticket).toBe('P777');
  });

  it('мест больше, чем игроков: лишние пусты; подходящих нет - null', () => {
    const one = order.map((e) => ({ ...e, playerUuid: 'same' }));
    expect(assignWinners(one, places)).toHaveLength(1);
    expect(
      nextEligibleIndex(['a', 'b'], new Set([0]), new Set(['a', 'b'])),
    ).toBeNull();
    expect(revealOrder([])).toEqual([]);
  });
});

describe('аудит отказов хранит HMAC, а не Discord ID; очистка сессий', () => {
  function makeAuth(over: Record<string, unknown> = {}) {
    const audit = {
      recordSafe: jest.fn(() => Promise.resolve()),
      record: jest.fn(() => Promise.resolve()),
    };
    const sessions = {
      create: jest.fn(() => Promise.resolve({})),
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
      findUnique: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    };
    const state = 'A'.repeat(43);
    const redis = {
      takeOAuthState: jest.fn(() =>
        Promise.resolve(
          JSON.stringify({ verifier: 'v', binderHash: sha256Hex('binder') }),
        ),
      ),
    };
    const discord = {
      exchange: jest.fn(() => Promise.resolve('tok')),
      identify: jest.fn(() =>
        Promise.resolve({
          id: '999999999999999999',
          name: 'x',
          mfaEnabled: true,
        }),
      ),
      revoke: jest.fn(() => Promise.resolve()),
      ...over,
    };
    const auth = new GiveawayAdminAuthService(
      { giveawayAdminSession: sessions } as never,
      redis as never,
      discord as never,
      audit as never,
      config(),
    );
    return { auth, audit, sessions, state };
  }

  it('not_allowed: actor = hmac:..., Discord ID нигде не записан', async () => {
    const t = makeAuth();
    const r = await t.auth.finishLogin('code', t.state, 'binder');
    expect(r).toEqual({ ok: false, error: 'not_allowed' });
    const entry = (
      t.audit.recordSafe.mock.calls[0] as unknown as [{ actor: string }]
    )[0];
    expect(entry.actor).toMatch(/^hmac:[0-9a-f]{24}$/);
    expect(entry.actor).toBe(t.auth.auditId('999999999999999999'));
    expect(JSON.stringify(t.audit.recordSafe.mock.calls)).not.toContain(
      '999999999999999999',
    );
    expect(t.auth.auditId('111111111111111111')).not.toBe(entry.actor);
  });

  it('вход закрыт без мастер-секрета: auditId = null', () => {
    const a = new GiveawayAdminAuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config({ GIVEAWAY_MASTER_SECRET: '' }),
    );
    expect(a.auditId('1')).toBeNull();
  });

  it('успешный вход удаляет истёкшие и отозванные сессии старше суток; ошибка очистки не мешает', async () => {
    const t = makeAuth({
      identify: jest.fn(() =>
        Promise.resolve({
          id: '111111111111111111',
          name: 'a',
          mfaEnabled: true,
        }),
      ),
    });
    const now = new Date('2027-01-01T10:00:00Z');
    const r = await t.auth.finishLogin('code', t.state, 'binder', now);
    expect(r.ok).toBe(true);
    const cutoff = new Date(now.getTime() - ADMIN_SESSION_RETENTION_MS);
    expect(t.sessions.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });
    t.sessions.deleteMany.mockRejectedValueOnce(new Error('db'));
    await expect(t.auth.purgeExpiredSessions(now)).resolves.toBeUndefined();
  });

  it('isSessionActive не обновляет lastSeenAt', async () => {
    const t = makeAuth();
    const token = 'B'.repeat(43);
    const now = new Date('2027-01-01T10:00:00Z');
    t.sessions.findUnique.mockResolvedValue({
      id: 's',
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      lastSeenAt: now,
      discordId: '111111111111111111',
      discordName: 'a',
    });
    await expect(t.auth.isSessionActive(token, now)).resolves.toBe(true);
    expect(t.sessions.updateMany).not.toHaveBeenCalled();
    t.sessions.findUnique.mockResolvedValue({
      id: 's',
      revokedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      lastSeenAt: now,
      discordId: '111111111111111111',
      discordName: 'a',
    });
    await expect(t.auth.isSessionActive(token, now)).resolves.toBe(false);
    await expect(t.auth.isSessionActive(null, now)).resolves.toBe(false);
  });
});

describe('тестовый SSE: перепроверка сессии', () => {
  function fakeRes() {
    return {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  async function setup(revalidate: () => Promise<boolean>) {
    const redis = {
      publish: jest.fn(() => Promise.resolve()),
      hasSubscriber: () => false,
      subscribe: jest.fn(() => Promise.resolve(() => undefined)),
    };
    const svc = new GiveawayStreamService(redis as never);
    const res = fakeRes();
    const req = { on: jest.fn() };
    await svc.attach(req as never, res as never, 'test', 'ip', 1, revalidate);
    return { svc, res };
  }

  it('сессия жива: событие доставлено', async () => {
    const t = await setup(() => Promise.resolve(true));
    await t.svc.publish('test', 'results', { revision: 2 });
    await flush();
    const out = t.res.write.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('event: results');
    expect(t.res.end).not.toHaveBeenCalled();
    t.svc.onModuleDestroy();
  });

  it('сессия отозвана: вместо события unauthorized и закрытие', async () => {
    const t = await setup(() => Promise.resolve(false));
    await t.svc.publish('test', 'results', { revision: 2 });
    await flush();
    const out = t.res.write.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('event: unauthorized');
    expect(out).not.toContain('event: results');
    expect(t.res.end).toHaveBeenCalled();
    t.svc.onModuleDestroy();
  });

  it('ошибка перепроверки = отказ (fail closed); heartbeat тоже перепроверяет', async () => {
    jest.useFakeTimers();
    try {
      const revalidate = jest.fn(() => Promise.reject(new Error('db')));
      const t = await setup(revalidate);
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(revalidate).toHaveBeenCalled();
      expect(t.res.end).toHaveBeenCalled();
      t.svc.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });
});
