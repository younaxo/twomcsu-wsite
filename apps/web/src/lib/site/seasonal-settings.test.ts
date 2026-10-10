import type { PublicSeasonalSettings } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import {
  SEASONAL_CAMPAIGNS,
  fallingModeOf,
  resolveSeasonalFromSettings,
  resolveSeasonalView,
} from './seasonal';

const base: PublicSeasonalSettings = {
  enabled: true,
  mode: 'auto',
  forcedCampaignId: null,
  showWordmarkO: true,
  showDecoration: true,
  showEffects: true,
  showBanners: true,
  effectIntensity: 2,
  fallingMode: 'season',
  fallingEffect: null,
  effectSpeed: 2,
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

  it('эффекты: по умолчанию кампании; свой набор из админки; [] — без эффектов', () => {
    expect(resolveSeasonalFromSettings(base, october)?.effects).toEqual(['leaves']);
    expect(
      resolveSeasonalFromSettings(
        { ...base, campaigns: { halloween: { effects: ['leaves', 'rain'] } } },
        october,
      )?.effects,
    ).toEqual(['leaves', 'rain']);
    expect(
      resolveSeasonalFromSettings({ ...base, campaigns: { halloween: { effects: [] } } }, october)
        ?.effects,
    ).toEqual([]);
    expect(
      resolveSeasonalFromSettings(
        {
          ...base,
          mode: 'forced',
          forcedCampaignId: 'new-year',
          campaigns: { 'new-year': { effects: ['snow', 'sun'] } },
        },
        october,
      )?.effects,
    ).toEqual(['snow', 'sun']);
  });
});

describe('resolveSeasonalView — независимые флаги (ADR-0090)', () => {
  const now = new Date('2026-10-20T12:00:00.000Z'); // окно Хэллоуина
  const settings = { ...base, serverTime: now.toISOString() };

  it('сезон ON, эффект OFF — украшение шапки и «o» остаются', () => {
    const view = resolveSeasonalView({ ...settings, fallingMode: 'off' }, now);
    expect(view.campaign?.id).toBe('halloween');
    expect(view.showDecoration).toBe(true);
    expect(view.showWordmarkO).toBe(true);
    expect(view.effects).toEqual([]);
  });

  it('украшение OFF не выключает эффект и наоборот', () => {
    const view = resolveSeasonalView({ ...settings, showDecoration: false }, now);
    expect(view.showDecoration).toBe(false);
    expect(view.effects.length).toBeGreaterThan(0);
  });

  it('сезон выключен, эффект «Всегда» — эффект без оформления сезона', () => {
    const view = resolveSeasonalView(
      { ...settings, enabled: false, fallingMode: 'always', fallingEffect: 'stars' },
      now,
    );
    expect(view.campaign).toBeNull();
    expect(view.showDecoration).toBe(false);
    expect(view.effects).toEqual(['stars']);
  });

  it('превью: сезон OFF / эффект ON без активации реального сезона', () => {
    const victory = SEASONAL_CAMPAIGNS.find((item) => item.id === 'victory-day')!;
    // Звёзды Дня Победы видны в превью без активации сезона и без его
    // оформления; режим «Выключен» превью тоже честно показывает выключенным.
    const view = resolveSeasonalView(settings, now, {
      campaign: victory,
      season: false,
      effect: true,
    });
    expect(view.campaign).toBeNull();
    expect(view.effects).toEqual(['stars']);
    expect(
      resolveSeasonalView({ ...settings, fallingMode: 'off' }, now, { campaign: victory }).effects,
    ).toEqual([]);
    expect(
      resolveSeasonalView(settings, now, { campaign: victory, effect: false }).effects,
    ).toEqual([]);
  });

  it('старые настройки без fallingMode: showEffects=false → эффекты выключены', () => {
    const legacy = { ...settings, fallingMode: undefined, showEffects: false } as never;
    expect(fallingModeOf(legacy)).toBe('off');
    expect(resolveSeasonalView(legacy, now).effects).toEqual([]);
  });
});
