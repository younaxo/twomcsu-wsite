import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resetAuthBootstrapForTests, useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { ForgotPasswordForm } from './forgot-password/forgot-form';
import { LoginForm, safeNext } from './login/login-form';
import { RegisterForm, validateRegister } from './register/register-form';
import { ResetPasswordForm, isTokenShapeValid } from './reset-password/reset-form';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, refresh: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

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

// Много ввода через user-event в jsdom — формам нужен запас по времени.
vi.setConfig({ testTimeout: 20_000 });

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = installFetchMock();
  navigation.params = new URLSearchParams();
  navigation.replace.mockReset();
  resetAuthBootstrapForTests();
  useAuthStore.setState({ status: 'anonymous', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth-формы «Полдня»', () => {
  it('login: логотип twomc.su, ссылки «Забыли пароль?»/«Зарегистрироваться», Turnstile-состояние, ошибка 401', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/login')) {
        return jsonResponse(
          { statusCode: 401, message: 'Неверный email/логин или пароль' },
          { status: 401 },
        );
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'twomc.su — на главную' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute(
      'href',
      '/register',
    );
    // Без NEXT_PUBLIC_TURNSTILE_SITE_KEY виджет честно сообщает, что защита не настроена.
    expect(screen.getByTestId('turnstile-unconfigured')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/E-mail или ник/), 'younaxo_');
    await user.type(screen.getByLabelText(/^Пароль/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(screen.getByLabelText(/^Пароль/)).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('login: 429 — rate-limit, 403 requiresCaptcha — сообщение про проверку Cloudflare', async () => {
    const user = userEvent.setup();
    let status = 429;
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/login')) {
        return status === 429
          ? jsonResponse({ statusCode: 429, message: 'Too Many Requests' }, { status: 429 })
          : jsonResponse({ statusCode: 403, requiresCaptcha: true }, { status: 403 });
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/E-mail или ник/), 'a');
    await user.type(screen.getByLabelText(/^Пароль/), 'b');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много попыток');
    status = 403;
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Cloudflare/));
  });

  it('safeNext — только внутренние пути, по умолчанию главная', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('/admin/roles')).toBe('/admin/roles');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
  });

  it('register: проверка полей, согласия обязательны и раздельны, реферальный код', async () => {
    const user = userEvent.setup();
    expect(
      validateRegister({
        email: 'x',
        username: 'a!',
        password: '123',
        confirm: '1',
        referral: '!',
      }),
    ).toEqual({
      email: 'Введите корректный e-mail.',
      username: 'Ник: 3–16 символов, латиница, цифры и подчёркивание.',
      password: 'Пароль: от 8 до 72 символов.',
      confirm: 'Пароли не совпадают.',
      referral: 'Код: 3–24 символа, латиница, цифры и подчёркивание.',
    });
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    render(<RegisterForm />, { wrapper: Providers });
    const form = screen.getByTestId('register-form');
    await user.type(within(form).getByLabelText(/E-mail/), 'new@twomc.su');
    await user.type(within(form).getByLabelText(/^Ник/), 'new_player');
    await user.type(within(form).getByLabelText(/^Пароль/), 'secret-pass-1');
    await user.type(within(form).getByLabelText(/Повторите пароль/), 'secret-pass-1');
    // Чекбоксы не отмечены заранее; без согласий код не отправляется.
    expect(screen.getByTestId('consent-terms')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('consent-personal-data')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Подтвердить почту' }));
    expect(await screen.findByText('Оба согласия обязательны.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/auth/register/start')),
    ).toBe(false);
    // Реферальный код — моноширинный и в верхнем регистре.
    const referral = within(form).getByLabelText(/Реферальный код/);
    expect(referral.className).toMatch(/font-mono/);
    await user.type(referral, 'younaxo');
    expect(referral).toHaveValue('YOUNAXO');
  });

  it('register: «Подтвердить почту» → код на этой же странице → «Создать аккаунт» → вход', async () => {
    const user = userEvent.setup();
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    fetchMock.mockImplementation(async (...args) => {
      const { path, body: raw } = requestInfo(args);
      const body = raw ? JSON.parse(String(raw)) : {};
      calls.push({ path, body });
      if (path.startsWith('/auth/register/start')) {
        return jsonResponse({
          verificationId: 'ver_1234567890',
          maskedEmail: 'ne***@twomc.su',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
          resendsLeft: 4,
        });
      }
      if (path.startsWith('/auth/register/verify')) {
        return body.code === '123456'
          ? jsonResponse({ completionToken: 'c'.repeat(64), email: 'ne***@twomc.su' })
          : jsonResponse(
              { statusCode: 400, code: 'otp_invalid', attemptsLeft: 4 },
              { status: 400 },
            );
      }
      if (path.startsWith('/auth/register/complete')) {
        return jsonResponse({ user: { id: 'u' }, accessToken: 'token-1' }, { status: 201 });
      }
      if (path.startsWith('/auth/me')) {
        return jsonResponse({
          id: 'u',
          shortId: 9,
          tag: 'new_player#0009',
          email: 'new@twomc.su',
          username: 'new_player',
          accessLevel: 0,
          accountType: 'DEFAULT',
          mustChangePassword: false,
          roles: [],
          permissions: { superuser: false, permissions: [], maxPriority: null },
        });
      }
      return new Response(null, { status: 404 });
    });
    render(<RegisterForm />, { wrapper: Providers });
    const form = screen.getByTestId('register-form');
    await user.type(within(form).getByLabelText(/E-mail/), 'New@twomc.su');
    await user.type(within(form).getByLabelText(/^Ник/), 'new_player');
    await user.type(within(form).getByLabelText(/^Пароль/), 'secret-pass-1');
    await user.type(within(form).getByLabelText(/Повторите пароль/), 'secret-pass-1');
    await user.click(screen.getByTestId('consent-terms'));
    await user.click(screen.getByTestId('consent-personal-data'));
    await user.click(screen.getByRole('button', { name: 'Подтвердить почту' }));

    const otp = await screen.findByTestId('otp-step');
    expect(otp).toHaveTextContent('ne***@twomc.su');
    const start = calls.find((c) => c.path.startsWith('/auth/register/start'));
    expect(start?.body).toEqual({
      email: 'new@twomc.su',
      username: 'new_player',
      acceptTerms: true,
      acceptPersonalData: true,
    });
    // Пароль не уходит на шаге отправки кода.
    expect(JSON.stringify(start?.body)).not.toContain('secret-pass-1');
    expect(screen.getByRole('button', { name: /Отправить повторно через/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Изменить E-mail' })).toBeInTheDocument();

    // Фокус сразу в первой ячейке кода.
    expect(screen.getByLabelText('Код, цифра 1')).toHaveFocus();
    // Неверный код — сообщение с числом попыток, поле очищено, фокус снова в первой ячейке.
    await user.keyboard('000000');
    expect(await screen.findByText('Неверный код. Осталось попыток: 4.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Код, цифра 1')).toHaveFocus());
    expect(screen.getByLabelText('Код, цифра 1')).toHaveValue('');
    // Новый ввод снимает сообщение об ошибке; Backspace стирает цифру одним нажатием.
    await user.keyboard('1');
    expect(screen.queryByText('Неверный код. Осталось попыток: 4.')).toBeNull();
    await user.keyboard('{Backspace}');
    expect(screen.getByLabelText('Код, цифра 1')).toHaveValue('');
    expect(screen.getByLabelText('Код, цифра 1')).toHaveFocus();
    await user.keyboard('123456');
    await screen.findByTestId('create-step');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
    const complete = calls.find((c) => c.path.startsWith('/auth/register/complete'));
    expect(complete?.body).toEqual({
      verificationId: 'ver_1234567890',
      completionToken: 'c'.repeat(64),
      password: 'secret-pass-1',
    });
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('register: ник успели занять до создания — понятная ошибка и возврат к форме с данными', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/register/start')) {
        return jsonResponse({
          verificationId: 'ver_1234567890',
          maskedEmail: 'ne***@twomc.su',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
          resendsLeft: 4,
        });
      }
      if (path.startsWith('/auth/register/verify')) {
        return jsonResponse({ completionToken: 'c'.repeat(64), email: 'ne***@twomc.su' });
      }
      if (path.startsWith('/auth/register/complete')) {
        return jsonResponse(
          { statusCode: 409, code: 'username_taken', message: 'Ник занят' },
          { status: 409 },
        );
      }
      return new Response(null, { status: 404 });
    });
    render(<RegisterForm />, { wrapper: Providers });
    const form = screen.getByTestId('register-form');
    await user.type(within(form).getByLabelText(/E-mail/), 'new@twomc.su');
    await user.type(within(form).getByLabelText(/^Ник/), 'new_player');
    await user.type(within(form).getByLabelText(/^Пароль/), 'secret-pass-1');
    await user.type(within(form).getByLabelText(/Повторите пароль/), 'secret-pass-1');
    await user.click(screen.getByTestId('consent-terms'));
    await user.click(screen.getByTestId('consent-personal-data'));
    await user.click(screen.getByRole('button', { name: 'Подтвердить почту' }));
    await screen.findByTestId('otp-step');
    await user.paste('123456');
    await screen.findByTestId('create-step');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    expect(await screen.findByText('Этот ник уже занят.')).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Изменить данные' }));
    const back = screen.getByTestId('register-form');
    expect(within(back).getByLabelText(/E-mail/)).toHaveValue('new@twomc.su');
    expect(within(back).getByLabelText(/^Ник/)).toHaveValue('new_player');
  });

  it('forgot: нейтральный ответ после отправки, не раскрывает наличие аккаунта', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      return path.startsWith('/auth/forgot-password')
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 404 });
    });
    render(<ForgotPasswordForm />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/E-mail/), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Отправить инструкцию' }));
    expect(await screen.findByTestId('forgot-sent')).toHaveTextContent(
      'Если на этот e-mail зарегистрирован аккаунт',
    );
  });

  it('reset: без токена — ошибка ссылки; с токеном — валидация и success state', async () => {
    const user = userEvent.setup();
    expect(isTokenShapeValid(null)).toBe(false);
    expect(isTokenShapeValid('zz')).toBe(false);
    render(<ResetPasswordForm />, { wrapper: Providers });
    expect(screen.getByTestId('reset-invalid-token')).toBeInTheDocument();

    navigation.params = new URLSearchParams({ token: 'a'.repeat(64) });
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      return path.startsWith('/auth/reset-password')
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 404 });
    });
    render(<ResetPasswordForm />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/Новый пароль/), 'short');
    await user.type(screen.getByLabelText(/Подтверждение/), 'short2');
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }));
    expect(screen.getByText('Пароль: от 8 до 72 символов.')).toBeInTheDocument();
    expect(screen.getByText('Пароли не совпадают.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Новый пароль/));
    await user.type(screen.getByLabelText(/Новый пароль/), 'new-secret-pass');
    await user.clear(screen.getByLabelText(/Подтверждение/));
    await user.type(screen.getByLabelText(/Подтверждение/), 'new-secret-pass');
    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }));
    expect(await screen.findByTestId('reset-done')).toBeInTheDocument();
  });
});

describe('вход через Discord/Telegram (только привязанные аккаунты)', () => {
  const providers = {
    discord: { enabled: true },
    telegram: { enabled: true, botUsername: 'twomcsu_testbot', botId: '123' },
  };

  it('кнопки с официальными иконками и разделителем «или»; Discord — переход на API', async () => {
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/social/providers')) return jsonResponse(providers);
      return new Response(null, { status: 404 });
    });
    navigation.params = new URLSearchParams('next=/shop');
    render(<LoginForm />, { wrapper: Providers });
    const discord = await screen.findByRole('link', { name: /Продолжить через Discord/ });
    expect(discord.getAttribute('href')).toMatch(/\/auth\/discord\/start\?next=%2Fshop$/);
    expect(discord.querySelector('svg path')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Продолжить через Telegram/ })).toBeInTheDocument();
    expect(screen.getByText('или')).toBeInTheDocument();
  });

  it('провайдеры не настроены — кнопок нет', async () => {
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/social/providers')) {
        return jsonResponse({
          discord: { enabled: false },
          telegram: { enabled: false, botUsername: null, botId: null },
        });
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('social-login')).toBeNull();
  });

  it('?social_error=discord_not_linked — понятное объяснение, аккаунт не создаётся', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(providers));
    navigation.params = new URLSearchParams('social_error=discord_not_linked');
    render(<LoginForm />, { wrapper: Providers });
    expect(
      await screen.findByText(/Этот Discord-аккаунт не привязан к twomc\.su/),
    ).toBeInTheDocument();
    expect(screen.getByText(/привяжите аккаунт в настройках профиля/)).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('Telegram: непривязанный аккаунт — ошибка, сессия не создаётся', async () => {
    const user = userEvent.setup();
    window.Telegram = {
      Login: {
        auth: (_options, callback) =>
          callback({ id: 1, auth_date: 1, hash: 'a'.repeat(64), first_name: 'T' }),
      },
    };
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/social/providers')) return jsonResponse(providers);
      if (path.startsWith('/auth/telegram/login')) {
        return jsonResponse(
          { statusCode: 403, code: 'telegram_not_linked', message: 'not linked' },
          { status: 403 },
        );
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginForm />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: /Продолжить через Telegram/ }));
    expect(
      await screen.findByText(/Этот Telegram-аккаунт не привязан к twomc\.su/),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(navigation.replace).not.toHaveBeenCalled();
    delete window.Telegram;
  });
});
