import {
  normalizeActor,
  normalizePunishmentRow,
  normalizeSourceString,
  normalizeUuid,
  RawPunishmentRow,
} from './normalize-punishment';
import { publicRef, SourceDataInvalid } from './punishment.types';

const NOW = 1_800_000_000_000;
const UUID = '123e4567-e89b-12d3-a456-426614174000';

function row(overrides: Partial<RawPunishmentRow> = {}): RawPunishmentRow {
  return {
    kind: 'BAN',
    id: 5n,
    uuid: UUID,
    reason: 'Читы',
    bannedByUuid: 'CONSOLE',
    bannedByName: 'Console',
    removedByUuid: null,
    removedByName: null,
    removedByReason: null,
    removedByDate: null,
    time: NOW - 1000,
    until: -1,
    template: 255,
    serverScope: '*',
    serverOrigin: 'survival',
    silent: false,
    ipban: false,
    active: true,
    ...overrides,
  };
}

describe('normalizeSourceString и normalizeUuid', () => {
  it('пустые значения и «#...» дают null', () => {
    expect(normalizeSourceString(null)).toBeNull();
    expect(normalizeSourceString('')).toBeNull();
    expect(normalizeSourceString('   ')).toBeNull();
    expect(normalizeSourceString('#offline#')).toBeNull();
    expect(normalizeSourceString('#expired')).toBeNull();
    expect(normalizeSourceString(' Admin ')).toBe('Admin');
  });

  it('uuid: нижний регистр, дефисы, мусор -> null', () => {
    expect(normalizeUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(UUID);
    expect(normalizeUuid('123e4567e89b12d3a456426614174000')).toBe(UUID);
    expect(normalizeUuid('#offline')).toBeNull();
    expect(normalizeUuid('CONSOLE')).toBeNull();
    expect(normalizeUuid('not-a-uuid')).toBeNull();
    expect(normalizeUuid(null)).toBeNull();
  });
});

describe('normalizeActor', () => {
  it('консоль по имени и по uuid', () => {
    expect(normalizeActor(null, 'Console')).toEqual({ console: true });
    expect(normalizeActor(null, '&cCONSOLE')).toEqual({ console: true });
    expect(normalizeActor('CONSOLE', null)).toEqual({ console: true });
  });

  it('игрок: uuid нормализован, имя очищено', () => {
    expect(normalizeActor(UUID.toUpperCase(), '&cAdmin')).toEqual({
      uuid: UUID,
      name: 'Admin',
    });
  });

  it('пусто -> null', () => {
    expect(normalizeActor(null, null)).toBeNull();
    expect(normalizeActor('#x', '#y')).toBeNull();
  });
});

describe('normalizePunishmentRow', () => {
  it('нормализует активный бессрочный бан', () => {
    const p = normalizePunishmentRow(row(), NOW);
    expect(p).toMatchObject({
      kind: 'BAN',
      sourceId: '5',
      subjectUuid: UUID,
      status: 'ACTIVE',
      until: null,
      removal: null,
      scope: '*',
      origin: 'survival',
      template: null,
      executor: { console: true },
      sourceActive: true,
      reason: 'Читы',
    });
    expect(p.startedAt.getTime()).toBe(NOW - 1000);
    expect(p.rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('принимает id и время строками и числами', () => {
    expect(
      normalizePunishmentRow(
        row({ id: '12345678901234567890', time: String(NOW), until: '0' }),
        NOW,
      ).sourceId,
    ).toBe('12345678901234567890');
    expect(normalizePunishmentRow(row({ id: 7 }), NOW).sourceId).toBe('7');
  });

  it('IP и контакты в причине скрываются до сохранения', () => {
    const p = normalizePunishmentRow(
      row({ reason: '&cчиты, ip 1.2.3.4, дс: user, a@b.com' }),
      NOW,
    );
    expect(p.reason).not.toMatch(/1\.2\.3\.4|user|a@b/);
  });

  it('срок в прошлом при active=1 -> EXPIRED', () => {
    expect(normalizePunishmentRow(row({ until: NOW - 10 }), NOW).status).toBe(
      'EXPIRED',
    );
  });

  it('снятие: REMOVED с removal', () => {
    const at = new Date(NOW - 5);
    const p = normalizePunishmentRow(
      row({
        removedByName: 'Moder',
        removedByUuid: UUID,
        removedByReason: 'Ошибка, ip 8.8.8.8',
        removedByDate: at,
        active: false,
      }),
      NOW,
    );
    expect(p.status).toBe('REMOVED');
    expect(p.removal?.by).toEqual({ uuid: UUID, name: 'Moder' });
    expect(p.removal?.reason).not.toContain('8.8.8.8');
    expect(p.removal?.at).toEqual(at);
  });

  it('снятие консолью -> REMOVED', () => {
    const p = normalizePunishmentRow(
      row({ removedByName: 'Console', removedByUuid: 'CONSOLE' }),
      NOW,
    );
    expect(p.status).toBe('REMOVED');
    expect(p.removal?.by).toEqual({ console: true });
  });

  it('`#expired` в removed_by_name не считается снятием', () => {
    const p = normalizePunishmentRow(
      row({ removedByName: '#expired', active: false }),
      NOW,
    );
    expect(p.status).toBe('EXPIRED');
    expect(p.removal).toBeNull();
  });

  it('removed_by_date по умолчанию (current_timestamp) не маркер снятия', () => {
    const p = normalizePunishmentRow(
      row({ removedByDate: new Date(NOW) }),
      NOW,
    );
    expect(p.status).toBe('ACTIVE');
    expect(p.removal).toBeNull();
  });

  it('kick всегда EXPIRED', () => {
    expect(
      normalizePunishmentRow(row({ kind: 'KICK', until: -1 }), NOW).status,
    ).toBe('EXPIRED');
  });

  it('template 255 и отрицательный -> null, иначе число', () => {
    expect(
      normalizePunishmentRow(row({ template: 255 }), NOW).template,
    ).toBeNull();
    expect(
      normalizePunishmentRow(row({ template: -3 }), NOW).template,
    ).toBeNull();
    expect(normalizePunishmentRow(row({ template: 3 }), NOW).template).toBe(3);
  });

  it('«#» в uuid -> null (IP-бан без игрока)', () => {
    const p = normalizePunishmentRow(
      row({ uuid: '#offline', ipban: true }),
      NOW,
    );
    expect(p.subjectUuid).toBeNull();
    expect(p.ipBan).toBe(true);
  });

  it.each([
    ['id = 0', { id: 0n }],
    ['id отрицательный', { id: -1 }],
    ['id не число', { id: 'abc' }],
    ['id дробный', { id: 1.5 }],
    ['time отрицательный', { time: -5 }],
    ['time слишком большой', { time: '99999999999999999' }],
    ['until слишком большой', { until: '99999999999999999' }],
    ['time не число', { time: 'x' }],
  ] as const)('SourceDataInvalid: %s', (_n, overrides) => {
    expect(() =>
      normalizePunishmentRow(row(overrides as Partial<RawPunishmentRow>), NOW),
    ).toThrow(SourceDataInvalid);
  });

  it('текст ошибки не содержит данных строки', () => {
    let caught: unknown = null;
    try {
      normalizePunishmentRow(row({ id: 'secret-host.example' }), NOW);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SourceDataInvalid);
    expect((caught as Error).message).not.toContain('secret-host');
  });
});

describe('rowHash', () => {
  it('детерминирован', () => {
    expect(normalizePunishmentRow(row(), NOW).rowHash).toBe(
      normalizePunishmentRow(row(), NOW + 5000).rowHash,
    );
  });

  it('не зависит от вычисляемого от времени статуса', () => {
    const early = normalizePunishmentRow(row({ until: NOW + 1000 }), NOW);
    const late = normalizePunishmentRow(row({ until: NOW + 1000 }), NOW + 5000);
    expect(early.status).toBe('ACTIVE');
    expect(late.status).toBe('EXPIRED');
    expect(early.rowHash).toBe(late.rowHash);
  });

  it.each([
    ['reason', { reason: 'Другое' }],
    ['until', { until: NOW + 99 }],
    ['active', { active: false }],
    ['снятие', { removedByName: 'Admin' }],
    ['причина снятия', { removedByName: 'Admin', removedByReason: 'ошибка' }],
    ['scope', { serverScope: 'lobby' }],
    ['silent', { silent: true }],
    ['ipban', { ipban: true }],
    ['executor', { bannedByName: 'Other', bannedByUuid: null }],
    ['subjectName', { subjectName: 'Player1' }],
    ['template', { template: 2 }],
    ['uuid', { uuid: '00000000-0000-0000-0000-000000000009' }],
  ] as const)('меняется при изменении: %s', (_n, overrides) => {
    const base = normalizePunishmentRow(row(), NOW).rowHash;
    const changed = normalizePunishmentRow(
      row(overrides as Partial<RawPunishmentRow>),
      NOW,
    ).rowHash;
    expect(changed).not.toBe(base);
  });
});

describe('publicRef', () => {
  it('строит ссылку вида ban-123', () => {
    expect(publicRef('BAN', '123')).toBe('ban-123');
    expect(publicRef('MUTE', '7')).toBe('mute-7');
  });
});
