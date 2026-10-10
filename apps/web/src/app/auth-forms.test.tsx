import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resetAuthBootstrapForTests, useAuthStore } from '@/lib/auth/store';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { AuthLayout } from '@/components/auth/auth-layout';
import { parseSocialResult } from '@/lib/auth/social';
import { SocialResultView } from './(auth)/auth/result/result-view';
import { ForgotPasswordForm } from './(auth)/forgot-password/forgot-form';
import { LoginForm, safeNext } from './(auth)/login/login-form';
import { RegisterForm, validateRegister } from './(auth)/register/register-form';
import { ResetPasswordForm, isTokenShapeValid } from './(auth)/reset-password/reset-form';

const navigation = vi.hoisted(() => ({
  pathname: '/login',
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
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
  navigation.pathname = '/login';
  navigation.params = new URLSearchParams();
  navigation.replace.mockReset();
  window.sessionStorage.clear();
  resetAuthBootstrapForTests();
  useAuthStore.setState({ status: 'anonymous', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth-формы «Полдня»', () => {
  it('login: панель с логотипом и переключателем «Вход | Регистрация», «Забыли пароль?», Turnstile, ошибка 401', async () => {
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
    render(
      <AuthLayout>
        <LoginForm />
      </AuthLayout>,
      { wrapper: Providers },
    );
    expect(screen.getByTestId('auth-panel')).toBeInTheDocument();
    // На обычном «Вход» tutorial сам НЕ открывается (только в регистрации).
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
    expect(screen.getByRole('link', { name: 'twomc.su — на главную' })).toBeInTheDocument();
    const modes = screen.getByRole('navigation', { name: 'Вход или регистрация' });
    expect(within(modes).getByRole('link', { name: 'Вход' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(modes).getByRole('link', { name: 'Регистрация' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'С возвращением' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute(
      'href',
      '/forgot-password',
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

  it('tutorial: сам открывается при входе в регистрацию (один раз за вкладку), вручную — кнопкой', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    navigation.pathname = '/register';
    const { unmount } = render(
      <AuthLayout>
        <RegisterForm />
      </AuthLayout>,
      { wrapper: Providers },
    );
    expect(await screen.findByTestId('auth-tutorial')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('auth-tutorial')).toBeNull());
    unmount();
    // Перезагрузка в той же вкладке — сам больше не всплывает…
    render(
      <AuthLayout>
        <RegisterForm />
      </AuthLayout>,
      { wrapper: Providers },
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
    // …но открыть вручную можно в любой момент, без перезагрузки.
    await user.click(screen.getByRole('button', { name: 'Как зарегистрироваться' }));
    expect(await screen.findByTestId('auth-tutorial')).toBeInTheDocument();
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
    // Без обоих согласий кнопка недоступна по-настоящему: disabled, клавиатура
    // и клик ничего не отправляют; рядом — подсказка.
    const primary = screen.getByRole('button', { name: 'Подтвердить почту' });
    expect(primary).toBeDisabled();
    expect(primary).toHaveAccessibleDescription(
      'Оба согласия обязательны — отметьте их, чтобы продолжить.',
    );
    await user.click(primary);
    await user.click(within(form).getByLabelText(/^Ник/));
    await user.keyboard('{Enter}');
    await user.click(screen.getByTestId('consent-terms'));
    expect(primary).toBeDisabled();
    await user.click(screen.getByTestId('consent-personal-data'));
    expect(primary).toBeEnabled();
    // Снятие одного согласия снова блокирует кнопку.
    await user.click(screen.getByTestId('consent-terms'));
    expect(primary).toBeDisabled();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/auth/register/start')),
    ).toBe(false);
    // Строка политики — часть legal-блока, но не согласие (без чекбокса).
    const legal = screen.getByTestId('legal-block');
    expect(within(legal).getByTestId('privacy-row')).toHaveTextContent(
      'Политика конфиденциальности',
    );
    expect(within(legal).getAllByRole('checkbox')).toHaveLength(2);
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
    // Поля регистрации остаются видны, но заблокированы до «Изменить E-mail».
    expect(within(form).getByLabelText(/E-mail/)).toBeDisabled();
    expect(within(form).getByLabelText(/E-mail/)).toHaveValue('New@twomc.su');
    expect(within(form).getByLabelText(/^Пароль/)).toBeDisabled();
    expect(screen.getByTestId('consent-terms')).toBeDisabled();
    expect(screen.getByTestId('register-primary')).toHaveTextContent('Подтвердить код');
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

  it('register: таймер повторной отправки истёк — «Отправить код повторно» активна, после отправки снова отсчёт', async () => {
    const user = userEvent.setup();
    const state = (resendInMs: number, resendsLeft: number) => ({
      verificationId: 'ver_1234567890',
      maskedEmail: 'ne***@twomc.su',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + resendInMs).toISOString(),
      resendsLeft,
    });
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/register/start')) return jsonResponse(state(-1000, 4));
      if (path.startsWith('/auth/register/resend')) return jsonResponse(state(60_000, 3));
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
    const resend = await screen.findByRole('button', { name: 'Отправить код повторно' });
    expect(resend).toBeEnabled();
    await user.click(resend);
    expect(
      await screen.findByRole('button', { name: /Отправить повторно через \d+ с/ }),
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/auth/register/resend')),
    ).toBe(true);
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
  const providers = { discord: { enabled: true }, telegram: { enabled: true } };

  it('кнопки одной геометрии с официальными иконками, разделитель «или», переход на API с next', async () => {
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/social/providers')) return jsonResponse(providers);
      return new Response(null, { status: 404 });
    });
    navigation.params = new URLSearchParams('next=/shop');
    render(<LoginForm />, { wrapper: Providers });
    const discord = await screen.findByRole('link', { name: 'Discord' });
    await waitFor(() =>
      expect(discord.getAttribute('href')).toMatch(/\/auth\/discord\/start\?next=%2Fshop$/),
    );
    const telegram = screen.getByRole('link', { name: 'Telegram' });
    expect(telegram.getAttribute('href')).toMatch(/\/auth\/telegram\/start\?next=%2Fshop$/);
    expect(discord.className).toBe(telegram.className);
    expect(discord.querySelector('svg path')).not.toBeNull();
    expect(screen.getByRole('separator')).toHaveTextContent('или');
  });

  it('пока список провайдеров грузится — кнопки недоступны; не настроены — остаются disabled', async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    render(<LoginForm />, { wrapper: Providers });
    const pendingLink = await screen.findByRole('link', { name: 'Discord' });
    expect(pendingLink).toHaveAttribute('aria-disabled', 'true');
    expect(pendingLink).not.toHaveAttribute('href');
    release(jsonResponse({ discord: { enabled: false }, telegram: { enabled: false } }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute(
        'data-state',
        'unavailable',
      ),
    );
    expect(screen.getByTestId('social-login')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Telegram не настроен — кнопка не исчезает, а disabled с пояснением; layout тот же', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ discord: { enabled: true }, telegram: { enabled: false } }),
    );
    render(<LoginForm />, { wrapper: Providers });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute('href'),
    );
    const telegram = screen.getByRole('link', { name: 'Telegram' });
    expect(telegram).toHaveAttribute('aria-disabled', 'true');
    expect(telegram).not.toHaveAttribute('href');
    expect(telegram).toHaveAccessibleDescription('Вход через Telegram временно недоступен');
    expect(telegram.className).toBe(screen.getByRole('link', { name: 'Discord' }).className);
  });

  it('ошибка проверки провайдеров — обе кнопки остаются (disabled) и есть «Повторить»', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 429 })
        : jsonResponse({ discord: { enabled: true }, telegram: { enabled: true } });
    });
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: Providers });
    const retry = await screen.findByRole('button', { name: 'Повторить' });
    expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('data-state', 'error');
    expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href'),
    );
  });
});

describe('SocialAuthResult — итог входа и привязки', () => {
  function renderResult(query: string) {
    navigation.params = new URLSearchParams(query);
    return render(<SocialResultView />, { wrapper: Providers });
  }

  it.each([
    ['discord', 'Вы вошли в twomc.su через Discord.'],
    ['telegram', 'Вы вошли в twomc.su через Telegram.'],
  ])(
    '%s: успешный вход — сессия из refresh-cookie, «Успешно!», «Продолжить» → next',
    async (provider, text) => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(async (...args) => {
        const { path } = requestInfo(args);
        if (path.startsWith('/auth/refresh')) return jsonResponse({ accessToken: 'token-1' });
        if (path.startsWith('/auth/me')) {
          return jsonResponse({
            id: 'u',
            shortId: 1,
            tag: 'player#0001',
            email: 'p@twomc.su',
            username: 'player',
            accessLevel: 0,
            accountType: 'DEFAULT',
            mustChangePassword: false,
            roles: [],
            permissions: { superuser: false, permissions: [], maxPriority: null },
          });
        }
        return new Response(null, { status: 404 });
      });
      renderResult(`provider=${provider}&mode=login&status=success&next=/shop`);
      expect(await screen.findByRole('heading', { name: 'Успешно!' })).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByText(/Продолжим автоматически через/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Продолжить' }));
      expect(navigation.replace).toHaveBeenCalledWith('/shop');
      expect(useAuthStore.getState().status).toBe('authenticated');
    },
  );

  it.each([
    [
      'provider=discord&mode=login&status=not_linked',
      'Аккаунт не привязан',
      /Этот Discord-аккаунт не связан с аккаунтом twomc\.su/,
      'Вернуться ко входу',
      '/login',
    ],
    [
      'provider=telegram&mode=login&status=not_linked',
      'Аккаунт не привязан',
      /подключите аккаунт в настройках профиля/,
      'Вернуться ко входу',
      '/login',
    ],
    [
      'provider=discord&mode=login&status=cancelled',
      'Вход отменён',
      /Вы отменили авторизацию через Discord\./,
      'Вернуться ко входу',
      '/login',
    ],
    [
      'provider=discord&mode=link&status=linked',
      'Успешно!',
      /Discord подключён к вашему аккаунту\./,
      'Вернуться в настройки',
      '/settings/linked-accounts',
    ],
    [
      'provider=telegram&mode=link&status=linked',
      'Успешно!',
      /Telegram подключён к вашему аккаунту\./,
      'Вернуться в настройки',
      '/settings/linked-accounts',
    ],
    [
      'provider=discord&mode=link&status=already_linked',
      'Уже подключено',
      /Этот Discord уже связан с вашим аккаунтом twomc\.su\./,
      'Вернуться в настройки',
      '/settings/linked-accounts',
    ],
    [
      'provider=discord&mode=link&status=taken',
      'Не удалось подключить Discord',
      /уже связан с другим аккаунтом twomc\.su/,
      'Вернуться в настройки',
      '/settings/linked-accounts',
    ],
    [
      'provider=telegram&mode=link&status=cancelled',
      'Подключение отменено',
      /Вы отменили авторизацию через Telegram\./,
      'Вернуться в настройки',
      '/settings/linked-accounts',
    ],
  ])('%s → «%s»', async (query, title, description, action, target) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    renderResult(query);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    await user.click(screen.getByRole('button', { name: action }));
    expect(navigation.replace).toHaveBeenCalledWith(target);
    // Ни один экран результата не создаёт сессию сам по себе.
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('техническая ошибка — без деталей, «Повторить» и «Вернуться ко входу»', () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    renderResult('provider=telegram&mode=login&status=error&code=secret_value');
    expect(screen.getByRole('heading', { name: 'Не удалось выполнить вход' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуться ко входу' })).toBeInTheDocument();
    expect(screen.getByTestId('social-auth-result')).not.toHaveTextContent('secret_value');
  });

  it('неизвестный статус трактуется как ошибка, внешний next игнорируется', () => {
    expect(
      parseSocialResult(
        new URLSearchParams('provider=discord&mode=login&status=hacked&next=//evil.example'),
      ),
    ).toEqual({ provider: 'discord', mode: 'login', status: 'error', next: '/' });
    expect(parseSocialResult(new URLSearchParams('provider=vk&status=success'))).toBeNull();
  });
});
