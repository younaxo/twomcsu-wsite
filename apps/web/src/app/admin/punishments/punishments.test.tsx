import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { toAdminRow } from '@/lib/admin/punishments';
import AdminPunishmentsPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), granted: new Set<string>() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/punishments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const item = (n: number, extra: Record<string, unknown> = {}) => ({
  ref: `ban-${n}`,
  kind: 'BAN',
  status: 'ACTIVE',
  subjectUuid: '11111111-1111-1111-1111-111111111111',
  subjectName: `Player${n}`,
  ipBan: false,
  silent: false,
  reason: 'Читы',
  reasonMasked: false,
  executor: { console: false, uuid: null, name: 'ModeratorX' },
  startedAt: '2026-11-20T10:00:00.000Z',
  until: null,
  permanent: true,
  removedAt: null,
  removedBy: null,
  removedReason: null,
  scope: null,
  origin: null,
  template: null,
  isHidden: false,
  hiddenReason: null,
  issuerHidden: false,
  issuerHiddenById: null,
  issuerHiddenAt: null,
  issuerHiddenReason: null,
  deletedAtSource: null,
  rev: 1,
  firstSeenAt: '2026-11-20T10:00:00.000Z',
  lastChangedAt: '2026-11-20T10:00:00.000Z',
  ...extra,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({
  items,
  nextCursor,
  meta: { generatedAt: '2026-11-22T10:00:00.000Z', stale: false },
});

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
  mocks.get.mockReset();
  mocks.granted = new Set(['users.punishments']);
});

describe('/admin/punishments', () => {
  it('без права: экран 403 и ни одного запроса', () => {
    mocks.granted = new Set();
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId('punishments')).toBeNull();
  });

  it('список: выдавший скрыт по умолчанию, раскрывается по кнопке', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(page([item(1)]));
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    const row = await screen.findByTestId('punishment-row');
    expect(row).toHaveTextContent('Player1');
    expect(row).toHaveTextContent('Читы');
    expect(row).not.toHaveTextContent('ModeratorX');
    expect(row).not.toHaveTextContent('11111111');
    await user.click(within(row).getByRole('button', { name: /Показать выдавшего/ }));
    expect(within(row).getByTestId('issuer-name')).toHaveTextContent('ModeratorX');
    expect(mocks.get.mock.calls[0]![0]).toBe('/admin/punishments');
  });

  it('принудительно скрытый выдавший не раскрывается', async () => {
    mocks.get.mockResolvedValue(page([item(2, { issuerHidden: true })]));
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    const row = await screen.findByTestId('punishment-row');
    expect(row).not.toHaveTextContent('ModeratorX');
    expect(within(row).queryByRole('button', { name: /Показать выдавшего/ })).toBeNull();
  });

  it('IP и контакты из ответа не доходят до строки', () => {
    const row = toAdminRow(item(3, { ip: '203.0.113.7', email: 'a@b.c', discord: 'x#1' }) as never);
    expect(JSON.stringify(row)).not.toMatch(/203\.0\.113|a@b\.c|x#1|1111/);
  });

  it('пусто и ошибка 403/500', async () => {
    mocks.get.mockResolvedValueOnce(page([]));
    const { unmount } = render(<AdminPunishmentsPage />, { wrapper: Providers });
    expect(await screen.findByText('Наказаний не найдено')).toBeVisible();
    unmount();
    mocks.get.mockRejectedValueOnce(new ApiError(500, ['Сбой']));
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeVisible();
  });

  it('«Показать ещё» грузит следующую страницу по курсору', async () => {
    const user = userEvent.setup();
    mocks.get.mockImplementation(async (_path: string, options: { query: { cursor?: string } }) =>
      options.query.cursor ? page([item(2)]) : page([item(1)], 'c1'),
    );
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findAllByTestId('punishment-row')).toHaveLength(2);
  });

  it('невалидный ник не отправляет запрос', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(page([item(1)]));
    render(<AdminPunishmentsPage />, { wrapper: Providers });
    await screen.findByTestId('punishment-row');
    await user.type(screen.getByLabelText('Ник игрока'), 'a!');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
