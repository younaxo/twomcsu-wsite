import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { MyServerPunishments } from './my-server-punishments';
import { PublicBanCard, PublicBansList } from './public-bans';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const META = { generatedAt: '2026-11-17T10:00:00.000Z', stale: false };

function pub(overrides: Record<string, unknown> = {}) {
  return {
    ref: 'ban-12',
    kind: 'BAN',
    subjectName: 'Steve_01',
    status: 'ACTIVE',
    startedAt: '2026-11-01T10:00:00.000Z',
    until: null,
    permanent: true,
    removedAt: null,
    reason: { key: 'cheats', label: 'Читы <b>и</b> &amp; «моды»' },
    executor: { name: 'ModAlex' },
    scope: { kind: 'server', name: 'survival' },
    ...overrides,
  };
}

function apiError(status: number, extra: { code?: string; retryAfter?: number } = {}) {
  const error = ApiError.fromResponse(status, { statusCode: status, code: extra.code });
  error.retryAfterSeconds = extra.retryAfter;
  return error;
}

beforeEach(() => {
  mocks.get.mockReset();
});

describe('/bans: публичный список', () => {
  it('показывает ник, тип, статус, срок, выдавшего и область; причина как есть, без разметки', async () => {
    mocks.get.mockResolvedValue({
      items: [
        pub(),
        pub({ ref: 'mute-3', kind: 'MUTE', scope: { kind: 'global' }, status: 'EXPIRED' }),
      ],
      nextCursor: null,
      meta: META,
    });
    const { container } = render(<PublicBansList />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('ban-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Steve_01');
    expect(rows[0]).toHaveTextContent('Бан');
    expect(rows[0]).toHaveTextContent('Действует');
    expect(rows[0]).toHaveTextContent('Бессрочно');
    expect(rows[0]).toHaveTextContent('ModAlex');
    // Причина выводится дословно, теги и сущности не интерпретируются.
    expect(rows[0]).toHaveTextContent('Читы <b>и</b> &amp; «моды»');
    expect(container.querySelector('table b')).toBeNull();
    expect(rows[1]).toHaveTextContent('Мут');
    expect(rows[1]).toHaveTextContent('Глобально');
    expect(rows[1]).toHaveTextContent('Истёк');
  });

  it('область с названием сервера и неизвестная область', async () => {
    mocks.get.mockResolvedValue({
      items: [pub(), pub({ ref: 'ban-13', scope: { kind: 'unknown' } })],
      nextCursor: null,
      meta: META,
    });
    render(<PublicBansList />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('ban-row');
    expect(rows[0]).toHaveTextContent('survival');
    expect(rows[1]).toHaveTextContent('Неизвестный сервер');
  });

  it('скрытый выдавший (executor null) и консоль: нейтральные подписи', async () => {
    mocks.get.mockResolvedValue({
      items: [pub({ executor: null }), pub({ ref: 'ban-14', executor: { console: true } })],
      nextCursor: null,
      meta: META,
    });
    render(<PublicBansList />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('ban-row');
    expect(rows[0]).toHaveTextContent('Выдавший не указан');
    expect(rows[0]).not.toHaveTextContent('ModAlex');
    expect(rows[1]).toHaveTextContent('Консоль');
  });

  it('грязные данные: IP, uuid и контакты в лишних полях не попадают в разметку', async () => {
    const dirty = pub({
      ip: '203.0.113.77',
      ipAddress: '198.51.100.5',
      subjectUuid: '123e4567-e89b-12d3-a456-426614174000',
      uuid: '123e4567-e89b-12d3-a456-426614174001',
      contact: 'user@example.org',
      email: 'leak@example.org',
      executor: { name: 'ModAlex', uuid: '123e4567-e89b-12d3-a456-426614174002', ip: '192.0.2.9' },
      scope: { kind: 'server', name: 'survival', ip: '192.0.2.10', uuid: 'u-1' },
      reason: { key: 'cheats', label: 'Читы', ip: '192.0.2.11', note: 'secret-note' },
    });
    mocks.get.mockResolvedValue({
      items: [dirty],
      nextCursor: null,
      meta: { ...META, ip: '10.0.0.1' },
    });
    const { container } = render(<PublicBansList />, { wrapper: Providers });
    await screen.findByTestId('ban-row');
    const html = container.innerHTML;
    for (const leaked of [
      '203.0.113.77',
      '198.51.100.5',
      '123e4567',
      'user@example.org',
      'leak@example.org',
      '192.0.2.',
      '10.0.0.1',
      'secret-note',
    ]) {
      expect(html).not.toContain(leaked);
    }
    expect(html).toContain('ModAlex');
  });

  it('пустой результат: «Ничего не найдено»', async () => {
    mocks.get.mockResolvedValue({ items: [], nextCursor: null, meta: META });
    render(<PublicBansList />, { wrapper: Providers });
    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument();
  });

  it('stale: показывает предупреждение о неактуальных данных', async () => {
    mocks.get.mockResolvedValue({
      items: [pub()],
      nextCursor: null,
      meta: { ...META, stale: true },
    });
    render(<PublicBansList />, { wrapper: Providers });
    expect(await screen.findByTestId('punishments-stale')).toHaveTextContent('неактуальными');
  });

  it('429: подсказка с Retry-After; 503: данные временно недоступны; 404: раздел недоступен', async () => {
    mocks.get.mockRejectedValueOnce(apiError(429, { retryAfter: 30 }));
    const first = render(<PublicBansList />, { wrapper: Providers });
    expect(await screen.findByText('Слишком много запросов')).toBeInTheDocument();
    expect(screen.getByText('Повторите попытку через 30 с.')).toBeInTheDocument();
    first.unmount();

    mocks.get.mockRejectedValueOnce(apiError(503, { code: 'punishments_unavailable' }));
    const second = render(<PublicBansList />, { wrapper: Providers });
    expect(await screen.findByText('Список наказаний временно недоступен')).toBeInTheDocument();
    second.unmount();

    mocks.get.mockRejectedValueOnce(apiError(404, { code: 'punishments_public_disabled' }));
    render(<PublicBansList />, { wrapper: Providers });
    expect(await screen.findByText('Раздел пока недоступен')).toBeInTheDocument();
  });

  it('поиск: короткий ник не отправляется, корректный уходит префиксом с фильтрами', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({ items: [pub()], nextCursor: null, meta: META });
    render(<PublicBansList />, { wrapper: Providers });
    await screen.findByTestId('ban-row');
    const callsBefore = mocks.get.mock.calls.length;

    const input = screen.getByRole('searchbox', { name: 'Ник игрока' });
    await user.type(input, 'ab');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('от 3 до 16');
    expect(mocks.get.mock.calls.length).toBe(callsBefore);

    await user.clear(input);
    await user.type(input, 'Ste');
    await user.click(screen.getByRole('radio', { name: 'Муты' }));
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    await screen.findByTestId('ban-row');
    const last = mocks.get.mock.calls.at(-1);
    expect(last?.[0]).toBe('/punishments/public');
    expect(last?.[1]).toMatchObject({
      auth: false,
      query: { name: 'Ste', kind: 'MUTE', order: 'desc', limit: 25 },
    });
  });

  it('мобильный переключатель сортировки по дате меняет order запроса', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({ items: [pub()], nextCursor: null, meta: META });
    render(<PublicBansList />, { wrapper: Providers });
    await screen.findAllByText('Steve_01');
    await user.click(screen.getByTestId('ban-cards-sort'));
    await screen.findByText('Сначала старые');
    expect(mocks.get.mock.calls.at(-1)?.[1]).toMatchObject({ query: { order: 'asc' } });
  });

  it('пагинация по курсору: «Показать ещё» запрашивает следующую страницу', async () => {
    const user = userEvent.setup();
    mocks.get
      .mockResolvedValueOnce({ items: [pub()], nextCursor: 'cur-1', meta: META })
      .mockResolvedValueOnce({
        items: [pub({ ref: 'ban-11', subjectName: 'Alex_2' })],
        nextCursor: null,
        meta: META,
      });
    render(<PublicBansList />, { wrapper: Providers });
    await screen.findAllByText('Steve_01');
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect((await screen.findAllByText('Alex_2')).length).toBeGreaterThan(0);
    expect(mocks.get.mock.calls[1][1]).toMatchObject({ query: { cursor: 'cur-1' } });
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('доступность: таблица с подписью, заголовки колонок и строк, поиск как region', async () => {
    mocks.get.mockResolvedValue({ items: [pub()], nextCursor: null, meta: META });
    render(<PublicBansList />, { wrapper: Providers });
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').length).toBe(8);
    expect(within(table).getByRole('rowheader')).toHaveTextContent('Steve_01');
    expect(table.querySelector('caption')).not.toBeNull();
    expect(screen.getByRole('search', { name: 'Поиск по списку наказаний' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Steve_01' })).toHaveAttribute(
      'href',
      '/bans/ban-12',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Показано записей: 1');
  });

  it('ссылка на карточку не строится для ref недопустимого формата', async () => {
    mocks.get.mockResolvedValue({
      items: [pub({ ref: '../admin' })],
      nextCursor: null,
      meta: META,
    });
    render(<PublicBansList />, { wrapper: Providers });
    await screen.findByTestId('ban-row');
    expect(screen.queryByRole('link', { name: 'Steve_01' })).toBeNull();
  });
});

describe('/bans/[ref]: карточка', () => {
  it('показывает поля белого списка и скрывает лишнее', async () => {
    mocks.get.mockResolvedValue({
      item: pub({ ip: '203.0.113.77', subjectUuid: '123e4567-e89b-12d3-a456-426614174000' }),
      meta: META,
    });
    const { container } = render(<PublicBanCard reference="ban-12" />, { wrapper: Providers });
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent('Steve_01');
    expect(card).toHaveTextContent('ModAlex');
    expect(card).toHaveTextContent('survival');
    expect(container.innerHTML).not.toContain('203.0.113.77');
    expect(container.innerHTML).not.toContain('123e4567');
    expect(mocks.get.mock.calls[0][0]).toBe('/punishments/public/ban-12');
  });

  it('недопустимый ref: запрос не отправляется', () => {
    render(<PublicBanCard reference="ban-0" />, { wrapper: Providers });
    expect(screen.getByText('Наказание не найдено')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404 punishments_not_found: «Наказание не найдено»', async () => {
    mocks.get.mockRejectedValue(apiError(404, { code: 'punishments_not_found' }));
    render(<PublicBanCard reference="ban-77" />, { wrapper: Providers });
    expect(await screen.findByText('Наказание не найдено')).toBeInTheDocument();
  });
});

function mine(overrides: Record<string, unknown> = {}) {
  return {
    ref: 'ban-5',
    kind: 'BAN',
    status: 'ACTIVE',
    startedAt: '2026-11-02T10:00:00.000Z',
    until: '2999-01-01T00:00:00.000Z',
    permanent: false,
    removedAt: null,
    reason: 'Использование читов: полный текст причины\nвторая строка',
    reasonMasked: false,
    executor: { name: 'ModAlex' },
    scope: { kind: 'server', name: 'survival' },
    appealable: true,
    appeals: [],
    ...overrides,
  };
}

describe('Мои наказания на серверах', () => {
  it('полный текст причины, срок, выдавший, область', async () => {
    mocks.get.mockResolvedValue({ linked: true, items: [mine()], nextCursor: null, meta: META });
    render(<MyServerPunishments />, { wrapper: Providers });
    const item = await screen.findByTestId('server-punishment');
    expect(item).toHaveTextContent('Использование читов: полный текст причины');
    expect(item).toHaveTextContent('вторая строка');
    expect(item).toHaveTextContent('Действует');
    expect(item).toHaveTextContent('ModAlex');
    expect(item).toHaveTextContent('survival');
    expect(mocks.get.mock.calls[0][0]).toBe('/punishments/me');
  });

  it('грязные данные: uuid и IP не попадают в разметку; скрытая часть причины помечена', async () => {
    mocks.get.mockResolvedValue({
      linked: true,
      items: [
        mine({
          reason: 'Причина [скрыто]',
          reasonMasked: true,
          executor: null,
          ip: '203.0.113.5',
          subjectUuid: '123e4567-e89b-12d3-a456-426614174000',
          executorUuid: '123e4567-e89b-12d3-a456-426614174009',
        }),
      ],
      nextCursor: null,
      meta: META,
    });
    const { container } = render(<MyServerPunishments />, { wrapper: Providers });
    const item = await screen.findByTestId('server-punishment');
    expect(item).toHaveTextContent('Выдавший не указан');
    expect(item).toHaveTextContent('Часть текста скрыта автоматически');
    expect(container.innerHTML).not.toContain('203.0.113.5');
    expect(container.innerHTML).not.toContain('123e4567');
  });

  it('linked=false: предложение привязать аккаунт', async () => {
    mocks.get.mockResolvedValue({ linked: false, items: [], nextCursor: null, meta: META });
    render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Minecraft-аккаунт не привязан')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Привязать аккаунт' })).toHaveAttribute(
      'href',
      '/settings/linked-accounts',
    );
  });

  it('пусто: понятное состояние', async () => {
    mocks.get.mockResolvedValue({ linked: true, items: [], nextCursor: null, meta: META });
    render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('На серверах наказаний нет')).toBeInTheDocument();
  });

  it('загрузка: скелетон с текстом для скринридера', () => {
    mocks.get.mockReturnValue(new Promise(() => undefined));
    render(<MyServerPunishments />, { wrapper: Providers });
    expect(screen.getByText('Загрузка наказаний на серверах')).toBeInTheDocument();
  });

  it('401, 429 (Retry-After), 503 и сетевая ошибка', async () => {
    mocks.get.mockRejectedValueOnce(apiError(401));
    let view = render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Нужно войти в аккаунт')).toBeInTheDocument();
    view.unmount();

    mocks.get.mockRejectedValueOnce(apiError(429, { retryAfter: 12 }));
    view = render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Повторите попытку через 12 с.')).toBeInTheDocument();
    view.unmount();

    mocks.get.mockRejectedValueOnce(apiError(503, { code: 'punishments_unavailable' }));
    view = render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Данные временно недоступны')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    view.unmount();
  });

  it('доступность: секция с заголовком, группа фильтра, список', async () => {
    mocks.get.mockResolvedValue({ linked: true, items: [mine()], nextCursor: null, meta: META });
    render(<MyServerPunishments />, { wrapper: Providers });
    await screen.findByTestId('server-punishment');
    expect(screen.getByRole('region', { name: 'Наказания на серверах' })).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Статус наказаний на серверах' }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('/bans: карточки на узких экранах (Q75)', () => {
  it('рендерит и таблицу (md+), и карточки (<md) с одинаковыми полями', async () => {
    mocks.get.mockResolvedValue({
      items: [pub(), pub({ ref: 'mute-3', kind: 'MUTE', status: 'EXPIRED' })],
      nextCursor: null,
      meta: META,
    });
    render(<PublicBansList />, { wrapper: Providers });
    const rows = await screen.findAllByTestId('ban-row');
    const cards = screen.getAllByTestId('ban-card');
    expect(rows).toHaveLength(2);
    expect(cards).toHaveLength(2);
    const wrapper = screen.getByTestId('bans-table-wrapper');
    expect(wrapper.className).toContain('hidden');
    expect(wrapper.className).toContain('md:block');
    expect(wrapper).toContainElement(screen.getByRole('table'));
    for (const card of cards) {
      expect(card.className).toContain('md:hidden');
      expect(card.className).toContain('min-w-0');
      expect(card.querySelector('.break-words')).not.toBeNull();
    }
    expect(cards[0]).toHaveTextContent('Steve_01');
    expect(cards[0]).toHaveTextContent('Бан');
    expect(cards[0]).toHaveTextContent('Действует');
    expect(cards[0]).toHaveTextContent('Читы <b>и</b> &amp; «моды»');
    expect(cards[0]).toHaveTextContent('Бессрочно');
    expect(cards[0]).toHaveTextContent('ModAlex');
    expect(cards[0]).toHaveTextContent('survival');
    expect(within(cards[0]).getByRole('link', { name: 'Steve_01' })).toHaveAttribute(
      'href',
      '/bans/ban-12',
    );
    expect(cards[1]).toHaveTextContent('Мут');
    expect(cards[1]).toHaveTextContent('Истёк');
  });
});

describe('Мои наказания на серверах: подача обращения (1.2)', () => {
  it('если appealable, есть «Обжаловать» со ссылкой на форму с номером наказания', async () => {
    mocks.get.mockResolvedValue({
      linked: true,
      items: [mine(), mine({ ref: 'mute-9', kind: 'MUTE' })],
      nextCursor: null,
      meta: META,
    });
    render(<MyServerPunishments />, { wrapper: Providers });
    const items = await screen.findAllByTestId('server-punishment');
    expect(items).toHaveLength(2);
    const ban = within(items[0]).getByRole('link', { name: /Обжаловать/ });
    expect(ban).toHaveAttribute('href', '/support/new/punishment_appeal?mc=ban-5');
    expect(ban).toHaveAccessibleName(/ban-5/);
    expect(within(items[1]).getByRole('link', { name: /Обжаловать/ })).toHaveAccessibleName(
      /mute-9/,
    );
  });

  it('нет кнопки, если сервер отдал appealable: false', async () => {
    mocks.get.mockResolvedValue({
      linked: true,
      items: [
        mine({ ref: 'ban-1', status: 'EXPIRED', appealable: false }),
        mine({ ref: 'ban-2', status: 'REMOVED', appealable: false }),
        mine({ ref: 'kick-3', kind: 'KICK', appealable: false }),
        mine({ ref: 'warn-4', kind: 'WARN', appealable: false }),
      ],
      nextCursor: null,
      meta: META,
    });
    render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findAllByTestId('server-punishment')).toHaveLength(4);
    expect(screen.queryByRole('link', { name: /Обжаловать/ })).toBeNull();
  });

  it('статус и комментарий обжалования на карточке; чужие поля не выводятся', async () => {
    mocks.get.mockResolvedValue({
      linked: true,
      items: [
        mine({
          appealable: false,
          appeals: [
            {
              reportNumber: 'R-2026-0001',
              status: 'REJECTED',
              createdAt: '2026-11-03T10:00:00.000Z',
              resolvedAt: '2026-11-04T10:00:00.000Z',
              verdict: 'Нарушение подтверждено',
              internalNote: 'секрет',
            },
            { reportNumber: 'bad', status: 'HACKED', createdAt: '2026-11-01T00:00:00.000Z' },
          ],
        }),
      ],
      nextCursor: null,
      meta: META,
    });
    render(<MyServerPunishments />, { wrapper: Providers });
    const appeals = await screen.findAllByTestId('punishment-appeal');
    expect(appeals).toHaveLength(1);
    expect(appeals[0]).toHaveAttribute('data-status', 'REJECTED');
    expect(appeals[0]).toHaveTextContent('Отклонено');
    expect(appeals[0]).toHaveTextContent('Нарушение подтверждено');
    expect(appeals[0]).not.toHaveTextContent('секрет');
    expect(screen.queryByRole('link', { name: /Обжаловать наказание/ })).toBeNull();
    expect(screen.getByText(/не снимает наказание само/)).toBeInTheDocument();
  });

  it('503 и 404 punishments_public_disabled: понятные состояния', async () => {
    mocks.get.mockRejectedValueOnce(apiError(503, { code: 'punishments_unavailable' }));
    const first = render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Данные временно недоступны')).toBeInTheDocument();
    first.unmount();
    mocks.get.mockRejectedValueOnce(apiError(404, { code: 'punishments_public_disabled' }));
    render(<MyServerPunishments />, { wrapper: Providers });
    expect(await screen.findByText('Раздел пока недоступен')).toBeInTheDocument();
  });
});
