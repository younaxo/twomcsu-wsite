import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import FaqPage from '@/app/(site)/faq/page';
import RulesPage from '@/app/(site)/rules/page';
import { LegalTopic } from './legal-topic';
import { TopicArticle } from './topic-article';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

const TOPIC = {
  id: 't1',
  slug: 'pvp',
  title: 'PvP-правила',
  category: 'RULES',
  description: 'Как драться честно',
  content:
    '## Запрещено\n\n- читы\n- **гриферство**\n\n<script>alert(1)</script>\n\n[ссылка](javascript:alert(1))',
  isPinned: true,
  updatedAt: '2026-10-01T10:00:00.000Z',
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
});

describe('Темы сайта (срезы 3.1, 3.2)', () => {
  it('текст — безопасный Markdown (без HTML и javascript:), дата редакции', async () => {
    mocks.get.mockResolvedValue(TOPIC);
    render(<TopicArticle slug="pvp" fallback={<p>нет</p>} />, { wrapper: Providers });
    const article = await screen.findByTestId('topic-article');
    expect(article).toHaveTextContent('Редакция от');
    expect(article.querySelector('script')).toBeNull();
    expect(article.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('гриферство').tagName).toBe('STRONG');
    expect(article.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('юридический документ без опубликованного текста — честная заглушка', async () => {
    mocks.get.mockImplementation(async () => {
      throw new ApiError(404, ['Тема не найдена']);
    });
    render(<LegalTopic slug="terms" fallback={<p>Документ готовится к публикации.</p>} />, {
      wrapper: Providers,
    });
    expect(await screen.findByText('Документ готовится к публикации.')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/topics/terms', expect.anything());
  });

  it('правила: карточка ведёт на полный текст; FAQ — вопросы и ответы', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue([TOPIC]);
    const rules = render(<RulesPage />, { wrapper: Providers });
    expect(await screen.findByTestId('rule-card')).toHaveAttribute('href', '/rules/pvp');
    rules.unmount();

    mocks.get.mockResolvedValue([
      {
        ...TOPIC,
        slug: 'how-join',
        title: 'Как зайти на сервер?',
        content: 'Адрес — **twomc.su**',
      },
    ]);
    render(<FaqPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Как зайти на сервер?' }));
    expect(await screen.findByText('twomc.su')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(
      '/topics',
      expect.objectContaining({ query: { category: 'FAQ' } }),
    );
  });
});
