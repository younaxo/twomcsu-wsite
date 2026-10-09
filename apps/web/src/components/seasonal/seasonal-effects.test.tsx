import type { PublicSeasonalSettings } from '@twomc/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonalEffects, particleCount } from './seasonal-effects';

const state: { seasonal: PublicSeasonalSettings | undefined; reduced: boolean } = {
  seasonal: undefined,
  reduced: false,
};

vi.mock('@/lib/site/hooks', () => ({
  usePublicSiteSettings: () => ({ isPending: false, data: { seasonal: state.seasonal } }),
}));
vi.mock('@/lib/use-media-query', () => ({
  usePrefersReducedMotion: () => state.reduced,
}));

function forced(campaign: string, patch: Partial<PublicSeasonalSettings> = {}) {
  return {
    enabled: true,
    mode: 'forced',
    forcedCampaignId: campaign,
    showWordmarkO: true,
    showDecoration: true,
    showEffects: true,
    showBanners: true,
    effectIntensity: 2,
    campaigns: {},
    serverTime: '2026-07-01T12:00:00.000Z',
    ...patch,
  } satisfies PublicSeasonalSettings;
}

describe('SeasonalEffects', () => {
  beforeEach(() => {
    state.seasonal = undefined;
    state.reduced = false;
    // jsdom без canvas: контекст недоступен — движок не рисует, но и не падает.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('принудительный «Новый год» — canvas со снегом, без перехвата кликов и ниже модалок', async () => {
    state.seasonal = forced('new-year');
    render(<SeasonalEffects />);
    const canvas = await screen.findByTestId('seasonal-effects');
    expect(canvas).toHaveAttribute('data-effect', 'snow');
    expect(canvas).toHaveAttribute('aria-hidden');
    expect(canvas.className).toMatch(/pointer-events-none/);
    expect(canvas.className).toMatch(/z-effects/);
  });

  it('эффекты выключены в настройках, у кампании нет эффекта или reduced-motion — ничего', async () => {
    state.seasonal = forced('new-year', { showEffects: false });
    const { rerender } = render(<SeasonalEffects />);
    await waitFor(() => expect(screen.queryByTestId('seasonal-effects')).toBeNull());

    state.seasonal = forced('black-friday');
    rerender(<SeasonalEffects />);
    await waitFor(() => expect(screen.queryByTestId('seasonal-effects')).toBeNull());

    state.seasonal = forced('halloween');
    state.reduced = true;
    rerender(<SeasonalEffects />);
    await waitFor(() => expect(screen.queryByTestId('seasonal-effects')).toBeNull());
  });

  it('частиц: плотность × ширина / 40, не больше 120', () => {
    expect(particleCount(375, 1)).toBe(9);
    expect(particleCount(1440, 2)).toBe(72);
    expect(particleCount(1920, 3)).toBe(120);
    expect(particleCount(1920, 9)).toBe(120);
  });
});
