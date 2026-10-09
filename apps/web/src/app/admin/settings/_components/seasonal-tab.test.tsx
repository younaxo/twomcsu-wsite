import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
  campaigns: {},
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

  it('без права редактирования — всё только для чтения, кнопки сохранения нет', async () => {
    mocks.editable = false;
    renderTab();
    await screen.findByTestId('seasonal-preview');
    expect(screen.getByRole('switch', { name: /Включена/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
    expect(screen.getByText(/с правом редактирования сезонов/)).toBeInTheDocument();
  });
});
