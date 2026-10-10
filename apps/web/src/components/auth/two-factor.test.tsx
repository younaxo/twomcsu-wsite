import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorState } from '@/components/ui/error-state';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { resetAuthBootstrapForTests, useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { SocialResultView } from '@/app/(auth)/auth/result/result-view';
import { LoginForm } from '@/app/(auth)/login/login-form';
import { TwoFactorSettings } from './two-factor-settings';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, refresh: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

vi.setConfig({ testTimeout: 20_000 });

function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const ME = {
  id: 'u1',
  shortId: 1,
  tag: 'younaxo_#0002',
  discriminator: '0002',
  email: 'y@example.com',
  username: 'younaxo_',
  avatar: null,
  banner: null,
  accessLevel: 0,
  accountType: 'DEFAULT',
  mustChangePassword: false,
  twoFactorEnabled: true,
  roles: [],
  permissions: { superuser: false, permissions: [], maxPriority: null },
};
const cell = (n: number) => screen.getByLabelText(`Код, цифра ${n}`);

let fetchMock: FetchMock;
beforeEach(() => {
  fetchMock = installFetchMock();
  navigation.params = new URLSearchParams();
  navigation.replace.mockReset();
  resetAuthBootstrapForTests();
  useAuthStore.setState({ status: 'anonymous', user: null });
});

describe('Вход с 2FA (ADR-0109)', () => {
  it('пароль → второй шаг; неверный код — остаток попыток; верный — вход', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    fetchMock.mockImplementation(async (...args) => {
      const { path, body } = requestInfo(args);
      if (path === '/auth/login') return jsonResponse({ twoFactorRequired: true });
      if (path === '/auth/login/2fa') {
        attempts += 1;
        if (attempts === 1) {
          return jsonResponse(
            {
              statusCode: 401,
              code: 'two_factor_invalid',
              message: 'Неверный код',
              attemptsLeft: 4,
            },
            { status: 401 },
          );
        }
        expect(JSON.parse(body ?? '{}')).toEqual({ code: '654321' });
        return jsonResponse({ user: { id: 'u1' }, accessToken: 'token' });
      }
      if (path === '/auth/me') return jsonResponse(ME);
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/E-mail или ник/), 'younaxo_');
    await user.type(screen.getByLabelText(/^Пароль/), 'Sup3rSecret!');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('heading', { name: 'Подтверждение входа' })).toBeInTheDocument();
    expect(cell(1)).toHaveFocus();
    await user.keyboard('123456');
    expect(await screen.findByText('Неверный код. Осталось попыток: 4.')).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    await user.click(cell(1));
    await user.keyboard('654321');
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('резервный код; истёкший челлендж — «Войти заново» возвращает к паролю', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path === '/auth/login') return jsonResponse({ twoFactorRequired: true });
      if (path === '/auth/login/2fa') {
        return jsonResponse(
          {
            statusCode: 401,
            code: 'two_factor_expired',
            message: 'Время на ввод кода истекло. Войдите ещё раз.',
          },
          { status: 401 },
        );
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/E-mail или ник/), 'younaxo_');
    await user.type(screen.getByLabelText(/^Пароль/), 'Sup3rSecret!');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await user.click(await screen.findByRole('button', { name: 'Использовать резервный код' }));
    await user.type(screen.getByLabelText(/Резервный код/), 'abcd-2345');
    await user.click(screen.getByRole('button', { name: 'Подтвердить вход' }));
    expect(
      await screen.findByText('Время на ввод кода истекло. Войдите ещё раз.'),
    ).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(
      (call) => requestInfo(call).path === '/auth/login/2fa',
    );
    expect(JSON.parse(requestInfo(loginCall!).body ?? '{}')).toEqual({ code: 'abcd-2345' });
    await user.click(screen.getByRole('button', { name: 'Войти заново' }));
    expect(await screen.findByRole('heading', { name: 'С возвращением' })).toBeInTheDocument();
  });

  it('вход через Discord при 2FA — страница результата показывает тот же второй шаг', async () => {
    navigation.params = new URLSearchParams('provider=discord&mode=login&status=two_factor');
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    render(<SocialResultView />, { wrapper: Providers });
    expect(await screen.findByRole('heading', { name: 'Подтверждение входа' })).toBeInTheDocument();
    expect(screen.getByTestId('two-factor-step')).toBeInTheDocument();
  });
});

describe('Настройки 2FA', () => {
  const status = (overrides: Record<string, unknown> = {}) => ({
    available: true,
    enabled: false,
    enabledAt: null,
    backupCodesRemaining: 0,
    ...overrides,
  });
  const CODES = Array.from({ length: 10 }, (_, index) => `abc${index}-def${index}`);

  it('сервер без ключа — честное «недоступно», без кнопки «Включить»', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(status({ available: false })));
    render(<TwoFactorSettings />, { wrapper: Providers });
    expect(await screen.findByTestId('two-factor-unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Включить' })).toBeNull();
  });

  it('включение: QR и ключ, первый код → резервные коды; «Готово» — только после отметки', async () => {
    const user = userEvent.setup();
    let enabled = false;
    fetchMock.mockImplementation(async (...args) => {
      const { path, body } = requestInfo(args);
      if (path === '/auth/2fa')
        return jsonResponse(status({ enabled, backupCodesRemaining: enabled ? 10 : 0 }));
      if (path === '/auth/2fa/setup') {
        return jsonResponse({
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/twomc.su%3Ayounaxo_?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        });
      }
      if (path === '/auth/2fa/enable') {
        expect(JSON.parse(body ?? '{}')).toEqual({ code: '123456' });
        enabled = true;
        return jsonResponse({ backupCodes: CODES });
      }
      return new Response(null, { status: 404 });
    });
    render(<TwoFactorSettings />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Включить' }));
    const dialog = await screen.findByTestId('two-factor-enable-dialog');
    expect(await within(dialog).findByTestId('two-factor-secret')).toHaveTextContent(
      'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    );
    expect(await within(dialog).findByTestId('two-factor-qr')).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
    await user.click(within(dialog).getByLabelText('Код, цифра 1'));
    await user.keyboard('123456');

    const codes = await screen.findByTestId('backup-codes-dialog');
    expect(within(codes).getAllByRole('listitem')).toHaveLength(10);
    const done = within(codes).getByRole('button', { name: 'Готово' });
    expect(done).toBeDisabled();
    await user.click(within(codes).getByRole('checkbox'));
    expect(done).toBeEnabled();
    await user.click(done);
    await waitFor(() => expect(screen.queryByTestId('backup-codes-dialog')).toBeNull());
    expect(await screen.findByText('Включена')).toBeInTheDocument();
  });

  it('включена: мало резервных кодов — предупреждение; отключение — пароль + код', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path === '/auth/2fa') {
        return jsonResponse(
          status({ enabled: true, enabledAt: '2026-10-10T20:00:00.000Z', backupCodesRemaining: 2 }),
        );
      }
      if (path === '/auth/2fa/disable') return jsonResponse({ success: true });
      return new Response(null, { status: 404 });
    });
    render(<TwoFactorSettings />, { wrapper: Providers });
    expect(await screen.findByTestId('backup-codes-remaining')).toHaveTextContent(
      'Резервных кодов осталось: 2. Создайте новые',
    );
    await user.click(screen.getByRole('button', { name: 'Отключить' }));
    const dialog = await screen.findByTestId('two-factor-disable-dialog');
    const submit = within(dialog).getByRole('button', { name: 'Отключить' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Пароль/), 'Sup3rSecret!');
    await user.type(within(dialog).getByLabelText(/Код из приложения или резервный/), '123456');
    await user.click(submit);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (item) => requestInfo(item).path === '/auth/2fa/disable',
      );
      expect(JSON.parse(requestInfo(call!).body ?? '{}')).toEqual({
        password: 'Sup3rSecret!',
        code: '123456',
      });
    });
  });
});

describe('Требование 2FA персоналу', () => {
  it('ошибка admin_2fa_required — понятный заголовок и ссылка «Включить 2FA», не «Повторить»', () => {
    const retry = vi.fn();
    render(
      <ErrorState
        error={
          new ApiError(403, ['Для действий администрации включите 2FA.'], {
            code: 'admin_2fa_required',
          })
        }
        onRetry={retry}
      />,
    );
    expect(screen.getByText('Нужна двухфакторная аутентификация')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Включить 2FA' })).toHaveAttribute(
      'href',
      '/settings/security',
    );
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });
});
