import { BadRequestException } from '@nestjs/common';
import { assertFullOrder, publicDisplayBadge } from './profiles.service';

describe('порядок бейджей и наград (J-07-6)', () => {
  it('assertFullOrder: перестановка своих id проходит', () => {
    expect(() =>
      assertFullOrder(['a', 'b', 'c'], ['c', 'a', 'b']),
    ).not.toThrow();
    expect(() => assertFullOrder([], [])).not.toThrow();
  });

  it('assertFullOrder: дубли, чужие и пропуски — 400', () => {
    for (const ids of [
      ['a', 'a', 'b'],
      ['a', 'b'],
      ['a', 'b', 'x'],
      ['a', 'b', 'c', 'd'],
    ]) {
      expect(() => assertFullOrder(['a', 'b', 'c'], ids)).toThrow(
        BadRequestException,
      );
    }
  });

  it('publicDisplayBadge: только {id,type}, неактивный и просроченный скрыты', () => {
    const now = new Date('2026-11-28T00:00:00Z');
    const base = {
      id: 'b1',
      type: 'VERIFIED',
      isActive: true,
      expiresAt: null,
    };
    const shown = { id: 'b1', type: 'VERIFIED' };
    expect(publicDisplayBadge(base, now)).toEqual(shown);
    expect(publicDisplayBadge(null, now)).toBeNull();
    expect(publicDisplayBadge({ ...base, isActive: false }, now)).toBeNull();
    expect(
      publicDisplayBadge(
        { ...base, expiresAt: new Date('2026-11-27T00:00:00Z') },
        now,
      ),
    ).toBeNull();
    expect(
      publicDisplayBadge(
        { ...base, expiresAt: new Date('2026-12-01T00:00:00Z') },
        now,
      ),
    ).toEqual(shown);
  });
});
