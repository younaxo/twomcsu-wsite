import { render, screen, waitFor, within } from '@testing-library/react';
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
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </ThemeProvider>
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
