import type { OwnProfileDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import ProfileSettingsPage from './page';
import PrivacySettingsPage from './privacy/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: mocks,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const profile: OwnProfileDto = {
  id: 'u1',
  shortId: 7,
  selectedDecoration: null,
  username: 'player',
  tag: 'player',
  email: 'p@example.com',
  avatar: null,
  banner: null,
  statusText: null,
  bio: null,
  country: null,
  city: null,
  gender: null,
  birthDate: null,
  showBirthDate: false,
  profileVisibility: 'EVERYONE',
  friendRequestPolicy: 'EVERYONE',
  directMessagePolicy: 'EVERYONE',
  commentPolicy: 'EVERYONE',
  commentsEnabled: true,
  hideEmail: true,
  hideCountry: false,
  hideCity: false,
  hideBirthDate: false,
  hideGender: false,
  hideStatistics: false,
  hideSocials: false,
  notifyOnComment: true,
  notifyOnMention: true,
  notifyOnReply: true,
  notifyOnFriendRequest: true,
  notifyOnGift: true,
  notifyOnOrder: true,
  socialLinks: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) =>
    path === '/users/me/social-links' ? [{ platform: 'VK', value: 'vk.com/player' }] : profile,
  );
  mocks.patch.mockImplementation(async (_path: string, body: object) => ({ ...profile, ...body }));
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'player' } as never,
    reload: vi.fn(async () => null),
  });
});

describe('Настройки → Профиль', () => {
  it('сохраняет «о себе»: пустые поля — null, кнопка активна только при изменениях', async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsPage />, { wrapper: Providers });
    const save = await screen.findByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Статус/ }), 'Строю замок');
    await user.click(save);
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/users/me/profile',
        expect.objectContaining({ statusText: 'Строю замок', bio: null, birthDate: null }),
      ),
    );
  });

  it('соцсеть сохраняется при выходе из поля; очищенная — удаляется', async () => {
    render(<ProfileSettingsPage />, { wrapper: Providers });
    const vk = await screen.findByRole('textbox', { name: 'ВКонтакте' });
    await waitFor(() => expect(vk).toHaveValue('vk.com/player'));
    fireEvent.change(vk, { target: { value: '' } });
    fireEvent.blur(vk);
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/users/me/social-links/VK'));
    const github = screen.getByRole('textbox', { name: 'GitHub' });
    fireEvent.change(github, { target: { value: 'player' } });
    fireEvent.blur(github);
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith('/users/me/social-links/GITHUB', {
        value: 'player',
      }),
    );
    // Discord и Telegram — только привязки (B5), не текст в соцсетях.
    expect(screen.queryByRole('textbox', { name: 'Telegram' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Discord' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Сайт' })).toBeInTheDocument();
  });

  it('аватар загружается файлом (multipart)', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({});
    render(<ProfileSettingsPage />, { wrapper: Providers });
    const avatar = await screen.findByTestId('image-avatar');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await user.upload(within(avatar).getByLabelText('Загрузить: аватар'), file);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0]!;
    expect(path).toBe('/users/me/avatar');
    expect((body as FormData).get('file')).toBe(file);
  });
});

describe('Настройки → Приватность', () => {
  it('переключатель сохраняется сразу', async () => {
    const user = userEvent.setup();
    render(<PrivacySettingsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('switch', { name: 'Скрыть соцсети' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/users/me/profile', { hideSocials: true }),
    );
  });
});
