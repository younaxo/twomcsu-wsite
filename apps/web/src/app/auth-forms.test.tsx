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

  it('register: валидация по контракту backend, успех → /login?registered=1', async () => {
    const user = userEvent.setup();
    expect(validateRegister({ email: 'x', username: 'a!', password: '123', confirm: '1' })).toEqual(
      {
        email: 'Введите корректный e-mail.',
        username: 'Ник: 3–16 символов, латиница, цифры и подчёркивание.',
        password: 'Пароль: от 8 до 72 символов.',
        confirm: 'Пароли не совпадают.',
      },
    );
    fetchMock.mockImplementation(async (...args) => {
      const { path, body: raw } = requestInfo(args);
      if (path.startsWith('/auth/register')) {
        const body = JSON.parse(String(raw));
        expect(body).toEqual({
          email: 'new@twomc.su',
          username: 'new_player',
          password: 'secret-pass-1',
        });
        return jsonResponse(
          { user: { id: 'u', email: body.email, username: body.username } },
          { status: 201 },
        );
      }
      return new Response(null, { status: 404 });
    });
    render(<RegisterForm />, { wrapper: Providers });
    const form = screen.getByTestId('register-form');
    await user.type(within(form).getByLabelText(/E-mail/), 'New@twomc.su');
    await user.type(within(form).getByLabelText(/^Ник/), 'new_player');
    await user.type(within(form).getByLabelText(/^Пароль/), 'secret-pass-1');
    await user.type(within(form).getByLabelText(/Повторите пароль/), 'secret-pass-1');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login?registered=1'));
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
