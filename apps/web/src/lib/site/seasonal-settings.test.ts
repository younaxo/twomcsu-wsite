import type { PublicSeasonalSettings } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { resolveSeasonalFromSettings } from './seasonal';

const base: PublicSeasonalSettings = {
  enabled: true,
  mode: 'auto',
  forcedCampaignId: null,
  showWordmarkO: true,
  showDecoration: true,
  showEffects: true,
  showBanners: true,
  effectIntensity: 2,
  campaigns: {},
  serverTime: '2026-10-20T12:00:00.000Z',
};
const october = new Date('2026-10-20T12:00:00Z');

describe('resolveSeasonalFromSettings (ADR-0079)', () => {
  it('выключено → нет; принудительно → выбранная кампания вне её окна', () => {
    expect(resolveSeasonalFromSettings({ ...base, enabled: false }, october)).toBeNull();
    expect(
      resolveSeasonalFromSettings(
        { ...base, mode: 'forced', forcedCampaignId: 'new-year' },
        october,
      )?.id,
    ).toBe('new-year');
  });

  it('авто: окно по дате; выключенная кампания пропускается; явные даты заменяют окно', () => {
    expect(resolveSeasonalFromSettings(base, october)?.id).toBe('halloween');
    expect(
      resolveSeasonalFromSettings(
        { ...base, campaigns: { halloween: { enabled: false } } },
        october,
      ),
    ).toBeNull();
    expect(
      resolveSeasonalFromSettings(
        {
          ...base,
          campaigns: {
            halloween: { startsAt: '2026-10-25T00:00:00Z', endsAt: '2026-11-02T00:00:00Z' },
          },
        },
        october,
      ),
    ).toBeNull();
    expect(
      resolveSeasonalFromSettings(
        {
          ...base,
          campaigns: {
            valentine: { startsAt: '2026-10-19T00:00:00Z', endsAt: '2026-10-21T00:00:00Z' },
          },
        },
        october,
      )?.id,
      // Равный priority (60): побеждает кампания, стоящая в реестре раньше.
    ).toBe('valentine');
  });
});
