import { computePunishmentStatus, StatusInput } from './punishment-status';

const NOW = 1_800_000_000_000;

function input(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    kind: 'BAN',
    active: true,
    untilMs: 0,
    removedByUuid: null,
    removedByName: null,
    ...overrides,
  };
}

describe('computePunishmentStatus (раздел 3.3)', () => {
  it('kick всегда EXPIRED, даже активный и бессрочный', () => {
    expect(computePunishmentStatus(input({ kind: 'KICK' }), NOW)).toBe(
      'EXPIRED',
    );
    expect(
      computePunishmentStatus(
        input({ kind: 'KICK', active: true, untilMs: NOW + 1000 }),
        NOW,
      ),
    ).toBe('EXPIRED');
  });

  it('kick со снятием остаётся EXPIRED', () => {
    expect(
      computePunishmentStatus(
        input({ kind: 'KICK', removedByName: 'Admin' }),
        NOW,
      ),
    ).toBe('EXPIRED');
  });

  it('заполнен removed_by_uuid -> REMOVED', () => {
    expect(
      computePunishmentStatus(
        input({ removedByUuid: '00000000-0000-0000-0000-000000000001' }),
        NOW,
      ),
    ).toBe('REMOVED');
  });

  it('заполнен removed_by_name -> REMOVED', () => {
    expect(
      computePunishmentStatus(input({ removedByName: 'Admin' }), NOW),
    ).toBe('REMOVED');
  });

  it('REMOVED сильнее active = 0', () => {
    expect(
      computePunishmentStatus(
        input({ active: false, removedByName: 'Admin' }),
        NOW,
      ),
    ).toBe('REMOVED');
  });

  it('REMOVED сильнее истёкшего срока', () => {
    expect(
      computePunishmentStatus(
        input({ removedByName: 'Admin', untilMs: NOW - 1 }),
        NOW,
      ),
    ).toBe('REMOVED');
  });

  it('active = 0 без снятия -> EXPIRED', () => {
    expect(computePunishmentStatus(input({ active: false }), NOW)).toBe(
      'EXPIRED',
    );
  });

  it('active = 0 с будущим сроком -> EXPIRED', () => {
    expect(
      computePunishmentStatus(
        input({ active: false, untilMs: NOW + 60_000 }),
        NOW,
      ),
    ).toBe('EXPIRED');
  });

  it('active = 1, срок в прошлом -> EXPIRED (LiteBans обновляет active раз в ~20 ч)', () => {
    expect(computePunishmentStatus(input({ untilMs: NOW - 1 }), NOW)).toBe(
      'EXPIRED',
    );
  });

  it('срок ровно сейчас -> EXPIRED', () => {
    expect(computePunishmentStatus(input({ untilMs: NOW }), NOW)).toBe(
      'EXPIRED',
    );
  });

  it('срок в будущем -> ACTIVE', () => {
    expect(computePunishmentStatus(input({ untilMs: NOW + 1 }), NOW)).toBe(
      'ACTIVE',
    );
  });

  it.each([0, -1, -1000])('until = %i (бессрочно) -> ACTIVE', (untilMs) => {
    expect(computePunishmentStatus(input({ untilMs }), NOW)).toBe('ACTIVE');
  });

  it.each(['MUTE', 'WARN'] as const)(
    '%s подчиняется тем же правилам',
    (kind) => {
      expect(computePunishmentStatus(input({ kind }), NOW)).toBe('ACTIVE');
      expect(
        computePunishmentStatus(input({ kind, untilMs: NOW - 5 }), NOW),
      ).toBe('EXPIRED');
      expect(
        computePunishmentStatus(input({ kind, removedByName: 'A' }), NOW),
      ).toBe('REMOVED');
    },
  );
});
