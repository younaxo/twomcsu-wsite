import { describe, expect, it } from 'vitest';
import { isoToLocalParts, localPartsToIso, timezoneLabel } from './local-datetime';

describe('local-datetime (ADR-0079)', () => {
  it('локальные дата и время ↔ ISO без сдвига', () => {
    const iso = localPartsToIso('2026-10-25', '18:30');
    expect(isoToLocalParts(iso)).toEqual({ date: '2026-10-25', time: '18:30' });
    expect(isoToLocalParts(localPartsToIso('2026-12-31', '', '23:59'))).toEqual({
      date: '2026-12-31',
      time: '23:59',
    });
  });

  it('пусто или мусор — нет даты', () => {
    expect(isoToLocalParts(null)).toEqual({ date: null, time: '' });
    expect(isoToLocalParts('not-a-date')).toEqual({ date: null, time: '' });
  });

  it('подпись пояса содержит UTC-смещение', () => {
    expect(timezoneLabel()).toMatch(/\(UTC[+−]\d{1,2}(:\d{2})?\)$/);
  });
});
