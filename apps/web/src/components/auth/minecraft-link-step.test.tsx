import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { LINK_CODE_PATTERN, formatByPattern } from '@/lib/auth/minecraft-code';
import { MinecraftLinkStep } from './minecraft-link-step';

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
  it('формат XXX-000-X0X0-0X0 (A12): регистр, дефисы сами, чужие символы позиции отбрасываются', () => {
    expect(formatByPattern('abc123a1b23c4', LINK_CODE_PATTERN)).toBe('ABC-123-A1B2-3C4');
    expect(formatByPattern('ABC 123-A1B2 3C4 EXTRA', LINK_CODE_PATTERN)).toBe('ABC-123-A1B2-3C4');
    // Цифра на месте буквы и наоборот не принимаются.
    expect(formatByPattern('1ABC', LINK_CODE_PATTERN)).toBe('ABC');
    expect(formatByPattern('ABCD123', LINK_CODE_PATTERN)).toBe('ABC-123');
    expect(formatByPattern('ABC-123-A1B2-3C4', LINK_CODE_PATTERN)).toHaveLength(16);
  });

  it('код привязки (16 символов) → код X0XX0 с командой; ошибки понятные', async () => {
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
          challenge: 'A1BC2',
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
    await user.paste('abc123a1b23c4');
    expect(input).toHaveValue('ABC-123-A1B2-3C4');
    expect(screen.getByText('13/13')).toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByText(/Код получен для другого ника/)).toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByTestId('minecraft-challenge-code')).toHaveTextContent('A1BC2');
    expect(screen.getByText('/site-connect A1BC2')).toBeInTheDocument();
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
          challenge: 'A1BC2',
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
        challenge: 'B2CD3',
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
          challenge: 'A1BC2',
          challengeExpiresAt: new Date(Date.now() - 1000).toISOString(),
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Получить новый код' }));
    expect(await screen.findByTestId('minecraft-challenge-code')).toHaveTextContent('B2CD3');
  });
});
