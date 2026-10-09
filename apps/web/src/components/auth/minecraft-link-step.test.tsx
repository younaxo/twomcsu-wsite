import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { MinecraftLinkStep, normalizeLinkCode } from './minecraft-link-step';

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const props = {
  verificationId: 'ver_1234567890',
  completionToken: 'c'.repeat(64),
  username: 'player',
};

describe('MinecraftLinkStep', () => {
  it('нормализация вставки: регистр, пробелы, дефисы, похожие символы, не больше 15', () => {
    expect(normalizeLinkCode('abcde-fghjk lmnpq')).toBe('ABCDEFGHJKLMNPQ');
    expect(normalizeLinkCode('ABCDEFGHJKLMNPQRSTU')).toHaveLength(15);
    expect(normalizeLinkCode('O0I1abc')).toBe('ABC');
  });

  it('код из 15 символов → 5-символьный код с командой; ошибки понятные', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/register/minecraft/code')) {
        attempt += 1;
        if (attempt === 1) {
          return jsonResponse(
            { statusCode: 400, code: 'mc_wrong_account', message: 'x' },
            { status: 400 },
          );
        }
        return jsonResponse({
          name: 'player',
          confirmed: false,
          challenge: 'K7Q2M',
          challengeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
        });
      }
      return new Response(null, { status: 404 });
    });
    render(<MinecraftLinkStep {...props} onConfirmed={() => undefined} />);
    const input = screen.getByLabelText(/Код привязки Minecraft/);
    const submit = screen.getByTestId('minecraft-submit');
    expect(submit).toBeDisabled();
    await user.click(input);
    await user.paste('abcde fghjk-lmnpq');
    expect(input).toHaveValue('ABCDEFGHJKLMNPQ');
    expect(screen.getByText('15/15')).toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByText(/Код получен для другого ника/)).toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByTestId('minecraft-challenge-code')).toHaveTextContent('K7Q2M');
    expect(screen.getByText('/site-connect K7Q2M')).toBeInTheDocument();
    expect(screen.getByText(/Ожидаем подтверждение в игре/)).toBeInTheDocument();
  });

  it('подтверждение в игре: опрос состояния → переход к созданию аккаунта', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onConfirmed = vi.fn();
    let confirmed = false;
    fetchMock.mockImplementation(async (...args) => {
      const { path } = requestInfo(args);
      if (path.startsWith('/auth/register/state')) {
        return jsonResponse({ minecraft: { confirmed } });
      }
      return new Response(null, { status: 404 });
    });
    render(
      <MinecraftLinkStep
        {...props}
        onConfirmed={onConfirmed}
        initialChallenge={{
          name: 'player',
          confirmed: false,
          challenge: 'K7Q2M',
          challengeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
        }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(onConfirmed).not.toHaveBeenCalled();
    confirmed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('срок 5-символьного кода истёк — «Получить новый код»', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        name: 'player',
        confirmed: false,
        challenge: 'B2C3D',
        challengeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      }),
    );
    render(
      <MinecraftLinkStep
        {...props}
        onConfirmed={() => undefined}
        initialChallenge={{
          name: 'player',
          confirmed: false,
          challenge: 'K7Q2M',
          challengeExpiresAt: new Date(Date.now() - 1000).toISOString(),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Получить новый код' }));
    expect(await screen.findByTestId('minecraft-challenge-code')).toHaveTextContent('B2C3D');
  });
});
