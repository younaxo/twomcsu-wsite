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
  fallingMode: 'season',
  fallingEffect: null,
  effectSpeed: 2,
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
    // Оформление сезона зависит от «Включена», падающий эффект — нет (ADR-0090).
    expect(screen.getByRole('switch', { name: /Украшение шапки/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Всегда' })).toBeEnabled();

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
      'Падающий эффект: Листья, Дождь.',
    );

    await user.click(screen.getByRole('radio', { name: 'Телефон' }));
    await user.click(screen.getByRole('radio', { name: 'Светлая' }));
    expect(frame).toHaveAttribute('data-device', 'mobile');
    expect(frame).toHaveAttribute('data-theme', 'light');

    // Сброс набора кампании к умолчанию — «По умолчанию» в строке Хэллоуина.
    const row = document.querySelector('[data-campaign="halloween"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'По умолчанию' }));
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent(
      'Падающий эффект: Листья.',
    );
    expect(within(row).getByText(/По умолчанию: Листья/)).toBeInTheDocument();
  });

  it('падающий эффект независим: «Всегда» — звёзды без сезона; «Выключен» — украшение остаётся', async () => {
    const user = userEvent.setup();
    mocks.get.mockReset().mockResolvedValue({
      ...SETTINGS,
      fallingMode: 'always',
      fallingEffect: 'stars',
    });
    renderTab();
    await screen.findByTestId('seasonal-preview');
    // Без оформления сезона (превью) звёзды всё равно падают.
    await user.click(screen.getByRole('switch', { name: /Оформление сезона/ }));
    expect(screen.getByTestId('seasonal-preview-decoration')).toHaveTextContent(
      'Оформление сезона: нет.',
    );
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent(
      'Падающий эффект: Красные звёзды.',
    );
    // Эффект выключен — украшение шапки сезона по-прежнему показывается.
    await user.click(screen.getByRole('switch', { name: /Оформление сезона/ }));
    await user.click(screen.getByRole('radio', { name: 'Выключен' }));
    expect(screen.getByTestId('seasonal-preview-effects')).toHaveTextContent(
      'Падающий эффект: нет.',
    );
    expect(screen.getByTestId('seasonal-preview-decoration')).toHaveTextContent(
      /Украшение шапки: (загружается|показано)/,
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0]?.[1]).toMatchObject({
      fallingMode: 'off',
      showEffects: false,
      showDecoration: true,
    });
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
