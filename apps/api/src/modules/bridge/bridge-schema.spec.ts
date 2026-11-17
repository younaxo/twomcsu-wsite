import {
  makeEvent,
  punishmentData,
} from '../../../test/support/bridge-support';
import {
  parseEnvelope,
  parseHello,
  parseOverflow,
  parsePunishmentData,
} from './bridge-schema';

const NOW = Date.now();
const OCCURRED = new Date(NOW);

function envelope(over: Record<string, unknown> = {}) {
  return {
    schema: 'twomc.bridge.v1',
    sentAt: new Date(NOW).toISOString(),
    events: [makeEvent('bridge.hello', { pluginVersion: '1.0.0' })],
    ...over,
  };
}

describe('parseEnvelope', () => {
  it('принимает валидную пачку', () => {
    const res = parseEnvelope(envelope());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.events).toHaveLength(1);
      expect(res.value.events[0].occurredAt).toBeInstanceOf(Date);
    }
  });

  it.each([
    ['не объект', 'x'],
    ['массив', []],
    ['лишнее поле конверта', envelope({ extra: 1 })],
    ['чужая схема', envelope({ schema: 'twomc.bridge.v2' })],
    ['sentAt без мс', envelope({ sentAt: '2026-11-17T12:00:00Z' })],
    [
      'sentAt несуществующая дата',
      envelope({ sentAt: '2026-02-30T12:00:00.000Z' }),
    ],
    ['пустой events', envelope({ events: [] })],
    ['events не массив', envelope({ events: {} })],
  ])('отклоняет: %s', (_name, body) => {
    expect(parseEnvelope(body).ok).toBe(false);
  });

  it('отклоняет 101 событие и принимает 100', () => {
    const hundred = Array.from({ length: 100 }, () =>
      makeEvent('bridge.hello', {}),
    );
    expect(parseEnvelope(envelope({ events: hundred })).ok).toBe(true);
    expect(
      parseEnvelope(
        envelope({ events: [...hundred, makeEvent('bridge.hello', {})] }),
      ).ok,
    ).toBe(false);
  });

  it.each([
    ['лишнее поле события', { ip: '1.2.3.4' }],
    ['короткий eventId', { eventId: 'short' }],
    ['eventId с недопустимыми символами', { eventId: 'x'.repeat(25) + '!' }],
    ['тип со спецсимволами', { type: 'a b\n' }],
    ['длинный тип', { type: 'a'.repeat(49) }],
    ['плохой serverId', { serverId: 'Bad.Id' }],
    ['seq 0', { seq: 0 }],
    ['seq дробный', { seq: 1.5 }],
    ['seq строка', { seq: '1' }],
    ['пустой streamId', { streamId: '' }],
    ['длинный streamId', { streamId: 'x'.repeat(65) }],
    ['occurredAt не дата', { occurredAt: 'вчера' }],
    ['data массив', { data: [] }],
    ['data null', { data: null }],
  ])('отклоняет событие: %s', (_name, over) => {
    const body = envelope({ events: [makeEvent('bridge.hello', {}, over)] });
    expect(parseEnvelope(body).ok).toBe(false);
  });

  it('не допускает отсутствие обязательного поля события', () => {
    const ev = makeEvent('bridge.hello', {});
    delete (ev as Record<string, unknown>).streamId;
    expect(parseEnvelope(envelope({ events: [ev] })).ok).toBe(false);
  });
});

describe('parsePunishmentData', () => {
  const parse = (
    type: Parameters<typeof parsePunishmentData>[0],
    data: Record<string, unknown>,
  ) => parsePunishmentData(type, data, OCCURRED, NOW);

  it('created: нормализованное наказание, статус вычисляет приёмник', () => {
    const res = parse('punishment.created', punishmentData());
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type !== 'deleted') {
      const p = res.value.punishment;
      expect(p.kind).toBe('BAN');
      expect(p.sourceId).toBe('123');
      expect(p.status).toBe('ACTIVE');
      expect(p.executor).toEqual({ console: true });
      expect(p.sourceActive).toBe(true);
      expect(p.rowHash).toMatch(/^[0-9a-f]{64}$/);
      expect(p.removal).toBeNull();
    }
  });

  it('status из data игнорируется', () => {
    const startedAt = new Date(NOW - 3600_000).toISOString();
    const res = parse(
      'punishment.created',
      punishmentData({ status: 'REMOVED', startedAt }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type !== 'deleted') {
      expect(res.value.punishment.status).toBe('ACTIVE');
    }
    const other = parse(
      'punishment.created',
      punishmentData({ status: 'ACTIVE', startedAt }),
    );
    expect(
      other.ok &&
        other.value.type !== 'deleted' &&
        other.value.punishment.rowHash,
    ).toBe(
      res.ok && res.value.type !== 'deleted'
        ? res.value.punishment.rowHash
        : null,
    );
  });

  it('истёкший срок даёт EXPIRED, KICK всегда EXPIRED', () => {
    const past = new Date(NOW - 1000).toISOString();
    const expired = parse(
      'punishment.updated',
      punishmentData({ until: past }),
    );
    const kick = parse('punishment.created', punishmentData({ kind: 'KICK' }));
    expect(
      expired.ok &&
        expired.value.type !== 'deleted' &&
        expired.value.punishment.status,
    ).toBe('EXPIRED');
    expect(
      kick.ok && kick.value.type !== 'deleted' && kick.value.punishment.status,
    ).toBe('EXPIRED');
  });

  it('removed: статус REMOVED, removal.at по умолчанию = occurredAt', () => {
    const res = parse(
      'punishment.removed',
      punishmentData({
        removal: {
          by: { uuid: null, name: 'Moder', console: false },
          reason: 'ошибка',
        },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type !== 'deleted') {
      const p = res.value.punishment;
      expect(p.status).toBe('REMOVED');
      expect(p.sourceActive).toBe(false);
      expect(p.removal?.at?.getTime()).toBe(OCCURRED.getTime());
      expect(p.removal?.by).toEqual({ uuid: null, name: 'Moder' });
      expect(p.removal?.reason).toBe('ошибка');
    }
  });

  it('removal в created/updated недопустим', () => {
    expect(
      parse('punishment.created', punishmentData({ removal: { by: null } })).ok,
    ).toBe(false);
  });

  it('deleted: достаточно kind и sourceId', () => {
    const res = parse('punishment.deleted', { kind: 'MUTE', sourceId: '7' });
    expect(res).toEqual({
      ok: true,
      value: { type: 'deleted', kind: 'MUTE', sourceId: '7' },
    });
    expect(
      parse('punishment.deleted', { kind: 'MUTE', sourceId: '7', reason: 'x' })
        .ok,
    ).toBe(false);
  });

  it.each([
    ['ip', { ip: '1.2.3.4' }],
    ['address', { address: '1.2.3.4' }],
    ['subjectIp', { subjectIp: '10.0.0.1' }],
    ['произвольное поле', { foo: 1 }],
    ['kind вне списка', { kind: 'JAIL' }],
    ['sourceId с нулями', { sourceId: '0123' }],
    ['sourceId 0', { sourceId: '0' }],
    ['sourceId не строка', { sourceId: 123 }],
    ['sourceId > 20 цифр', { sourceId: '1'.repeat(21) }],
    ['плохой uuid', { subjectUuid: 'not-a-uuid' }],
    ['subjectName длиннее 32', { subjectName: 'n'.repeat(33) }],
    ['reason длиннее 2048', { reason: 'r'.repeat(2049) }],
    ['startedAt без мс', { startedAt: '2026-11-17T10:00:00Z' }],
    ['until не дата', { until: 'never' }],
    ['ipBan не boolean', { ipBan: 'false' }],
    ['template вне диапазона', { template: 300 }],
    ['scope длиннее 32', { scope: 's'.repeat(33) }],
    ['executor с лишним полем', { executor: { name: 'a', ip: '1.1.1.1' } }],
    ['console с именем', { executor: { console: true, name: 'a' } }],
  ])('отклоняет: %s', (_name, over) => {
    expect(parse('punishment.created', punishmentData(over)).ok).toBe(false);
  });

  it('обязательны kind, sourceId, startedAt', () => {
    for (const key of ['kind', 'sourceId', 'startedAt']) {
      const data = punishmentData();
      delete (data as Record<string, unknown>)[key];
      expect(parse('punishment.created', data).ok).toBe(false);
    }
  });

  it('причина очищается от цветовых кодов и IP (защита в глубину)', () => {
    const res = parse(
      'punishment.created',
      punishmentData({ reason: '&cЧит, ip 203.0.113.7 была' }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type !== 'deleted') {
      expect(res.value.punishment.reason).not.toMatch(/203\.0\.113\.7/);
      expect(res.value.punishment.reason).not.toContain('&c');
    }
  });

  it('template 255 превращается в null, UUID приводится к нижнему регистру', () => {
    const res = parse(
      'punishment.created',
      punishmentData({
        template: 255,
        subjectUuid: '069A79F4-44E9-4726-A5BE-FCA90E38AAF5',
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.value.type !== 'deleted') {
      expect(res.value.punishment.template).toBeNull();
      expect(res.value.punishment.subjectUuid).toBe(
        '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      );
    }
  });
});

describe('parseHello и parseOverflow', () => {
  it('hello: неизвестные поля игнорируются, длины по колонкам БД', () => {
    expect(
      parseHello({ pluginVersion: '1.0', platform: 'x', extra: 1 }),
    ).toEqual({
      ok: true,
      value: { pluginVersion: '1.0', platform: 'x' },
    });
    expect(parseHello({ pluginVersion: 'v'.repeat(33) }).ok).toBe(false);
    // L4: строгий формат.
    expect(parseHello({ pluginVersion: '1.2.3-beta+4', platform: 'Paper 1.21' }).ok).toBe(true);
    for (const bad of ['<b>x</b>', '1.0\n2', ' 1.0', 'a/b', '']) {
      expect(parseHello({ pluginVersion: bad }).ok).toBe(false);
      expect(parseHello({ platform: bad }).ok).toBe(false);
    }
    expect(parseHello({ platform: 'p'.repeat(49) }).ok).toBe(false);
    expect(parseHello({ protocol: 2 }).ok).toBe(false);
    expect(parseHello({ pluginVersion: 5 }).ok).toBe(false);
  });

  it('overflow: целые неотрицательные, toSeq >= fromSeq', () => {
    expect(parseOverflow({ fromSeq: 1, toSeq: 5, dropped: 5 }).ok).toBe(true);
    expect(parseOverflow({ fromSeq: 5, toSeq: 1, dropped: 1 }).ok).toBe(false);
    expect(parseOverflow({ fromSeq: 1, toSeq: 2 }).ok).toBe(false);
    expect(parseOverflow({ fromSeq: -1, toSeq: 2, dropped: 1 }).ok).toBe(false);
  });
});
