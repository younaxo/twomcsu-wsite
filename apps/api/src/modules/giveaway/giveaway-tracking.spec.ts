import { HttpException } from '@nestjs/common';
import { generateTrackingToken } from './giveaway-codes';
import { GiveawayCodesService } from './giveaway-codes.service';
import { GiveawayPublicController } from './giveaway-public.controller';
import { GiveawayTicketsService } from './giveaway-tickets.service';
import { GiveawayConfig, readGiveawayConfig } from './giveaway.config';
import { TRACKING_TOKEN_PATTERN } from './giveaway.constants';

const UUID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'abcDEF0123456789_-abcDEF0123456789';
const NOW = new Date('2026-12-01T10:00:00.000Z');
const settingsValue = {
  thresholdMinutes: 3000,
  startAt: new Date('2026-11-21T21:00:00.000Z'),
  cutoffAt: new Date('2026-12-30T20:59:59.000Z'),
  allowedServers: ['anarchy-new-era'],
};

function makeEnv(minutes = 3125) {
  const row = {
    id: 't1',
    ticket: 'K417',
    playerUuid: UUID,
    playerName: 'Steve',
    issuedAt: NOW,
    trackingToken: TOKEN,
  };
  const db = {
    giveawayTicket: {
      findUnique: jest.fn(({ where }: { where: { trackingToken: string } }) =>
        Promise.resolve(where.trackingToken === TOKEN ? row : null),
      ),
    },
    giveawayMinute: { count: jest.fn(() => Promise.resolve(minutes)) },
  };
  const redis = { hit: jest.fn().mockResolvedValue(0) };
  const settings = { get: jest.fn().mockResolvedValue(settingsValue) };
  const tickets = new GiveawayTicketsService(
    db as never,
    redis as never,
    settings as never,
    {} as never,
  );
  const config: GiveawayConfig = {
    ...readGiveawayConfig({ get: () => undefined as never }),
    enabled: true,
    masterSecret: Buffer.alloc(32, 7),
  };
  const ctrl = new GiveawayPublicController(
    {} as unknown as GiveawayCodesService,
    redis as never,
    tickets,
    config,
  );
  const res = { setHeader: jest.fn() };
  return { db, redis, tickets, ctrl, res };
}

const req = { ip: '203.0.113.5' } as never;

describe('токен отслеживания', () => {
  it('генерация: base64url, не короче 22 символов, подходит под шаблон', () => {
    const t = generateTrackingToken();
    expect(t.length).toBeGreaterThanOrEqual(22);
    expect(TRACKING_TOKEN_PATTERN.test(t)).toBe(true);
  });
  it('уникальность на 2000 генераций', () => {
    const set = new Set(Array.from({ length: 2000 }, generateTrackingToken));
    expect(set.size).toBe(2000);
  });
  it('шаблон принимает 32 hex из миграции и отклоняет мусор', () => {
    expect(
      TRACKING_TOKEN_PATTERN.test('0123456789abcdef0123456789abcdef'),
    ).toBe(true);
    expect(TRACKING_TOKEN_PATTERN.test('K417')).toBe(false);
    expect(TRACKING_TOKEN_PATTERN.test('a'.repeat(21))).toBe(false);
    expect(TRACKING_TOKEN_PATTERN.test('a'.repeat(30) + '!!')).toBe(false);
  });
});

describe('GET tickets/track/:token', () => {
  it('отдаёт только номер, ник, время и статус', async () => {
    const e = makeEnv(3125);
    const r = await e.ctrl.track(TOKEN, req, e.res as never);
    expect(r).toEqual({
      ticket: 'K417',
      playerName: 'Steve',
      played: { hours: 52, minutes: 5 },
      status: 'running',
    });
    expect(JSON.stringify(r)).not.toContain(UUID);
    expect(e.res.setHeader).toHaveBeenLastCalledWith(
      'Cache-Control',
      'public, max-age=60',
    );
  });
  it('статус finished после окончания', async () => {
    const e = makeEnv();
    const r = await e.tickets.track(TOKEN, new Date('2027-01-02T00:00:00Z'));
    expect(r?.status).toBe('finished');
  });
  it('неизвестный токен и неверный формат - одинаковый 404, БД не читается при мусоре', async () => {
    const e = makeEnv();
    const unknown = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    for (const bad of [unknown, 'K417', '../../etc', '']) {
      const err = await e.ctrl
        .track(bad, req, e.res as never)
        .catch((x: unknown) => x);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
      expect((err as HttpException).getResponse()).toEqual({
        error: 'not_found',
      });
    }
    expect(e.db.giveawayTicket.findUnique).toHaveBeenCalledTimes(1);
  });
  it('лимит по IP: 429 до обращения к БД', async () => {
    const e = makeEnv();
    e.redis.hit.mockResolvedValueOnce(12);
    const err = await e.ctrl
      .track(TOKEN, req, e.res as never)
      .catch((x: unknown) => x);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(e.db.giveawayTicket.findUnique).not.toHaveBeenCalled();
    expect(e.redis.hit.mock.calls[0][0]).toBe('track-net');
  });
});
