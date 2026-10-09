import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonalTab } from './seasonal-tab';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  editable: true,
}));

vi.mock('@/lib/api/client', () => ({
  api: { get: mocks.get, patch: mocks.patch },
}));
vi.mock('@/lib/site/hooks', () => ({
  usePublicSiteSettings: () => ({ data: undefined, dataUpdatedAt: 0 }),
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (key: string) => key !== 'settings.seasonal.edit' || mocks.editable,
  }),
}));

const SETTINGS = {
  enabled: true,
  mode: 'forced',
  forcedCampaignId: 'halloween',
  showWordmarkO: true,
  showDecoration: true,
  showEffects: true,
  showBanners: true,
  effectIntensity: 2,
  campaigns: { halloween: { effects: ['leaves', 'rain'] } },
  updatedAt: '2026-10-10T00:00:00.000Z',
};

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SeasonalTab />
    </QueryClientProvider>,
  );
}

describe('SeasonalTab', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue(SETTINGS);
    mocks.patch
      .mockReset()
      .mockImplementation((_path: string, body: unknown) => Promise.resolve(body));
    mocks.editable = true;
    // jsdom без canvas: превью эффектов не рисует, но и не шумит в консоли.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('предпросмотр учитывает несохранённые изменения; «Сохранить» отправляет форму', async () => {
    const user = userEvent.setup();
    renderTab();
    expect(await screen.findByTestId('seasonal-preview')).toHaveTextContent('Хэллоуин');
    expect(screen.getAllByRole('listitem')).toHaveLength(8);

    await user.click(screen.getByRole('switch', { name: /Включена/ }));
    expect(screen.getByTestId('seasonal-preview')).toHaveTextContent('Без сезонного оформления');
    expect(screen.getByRole('switch', { name: /Эффекты/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0]?.[0]).toBe('/admin/settings/seasonal');
    expect(mocks.patch.mock.calls[0]?.[1]).toMatchObject({ enabled: false, mode: 'forced' });
  });

  it('предпросмотр: любая кампания, телефон и светлая тема; эффекты кампании и пояс админа', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByTestId('seasonal-preview');
    expect(screen.getByTestId('seasonal-timezone')).toHaveTextContent(/Часовой пояс: .*UTC/);
    const frame = screen.getByTestId('seasonal-preview-frame');
    expect(frame).toHaveAttribute('data-theme', 'dark');
    expect(frame).toHaveAttribute('data-device', 'desktop');
    // Хэллоуин с набором из админки (листья + дождь), а не только эффект по умолчанию.
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent(
      'Эффекты: Листья, Дождь.',
    );

    await user.click(screen.getByRole('radio', { name: 'Телефон' }));
    await user.click(screen.getByRole('radio', { name: 'Светлая' }));
    expect(frame).toHaveAttribute('data-device', 'mobile');
    expect(frame).toHaveAttribute('data-theme', 'light');

    // Сброс набора кампании к умолчанию — «По умолчанию» в строке Хэллоуина.
    const row = document.querySelector('[data-campaign="halloween"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'По умолчанию' }));
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent('Эффекты: Листья.');
    expect(within(row).getByText(/По умолчанию: Листья/)).toBeInTheDocument();
  });

  it('без права редактирования — всё только для чтения, кнопки сохранения нет', async () => {
    mocks.editable = false;
    renderTab();
    await screen.findByTestId('seasonal-preview');
    expect(screen.getByRole('switch', { name: /Включена/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
    expect(screen.getByText(/с правом редактирования сезонов/)).toBeInTheDocument();
  });
});
