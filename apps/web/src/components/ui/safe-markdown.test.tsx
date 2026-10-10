import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ExternalLinkGuard } from '@/components/shell/external-link-guard';
import { SafeMarkdown, safeHref } from './safe-markdown';

/// Bio (ADR-0100): безопасный Markdown → React-узлы, без HTML.

function md(source: string) {
  const { container } = render(<SafeMarkdown source={source} />);
  return container.querySelector('[data-testid="safe-markdown"]') as HTMLElement;
}

describe('SafeMarkdown — поддержанный набор', () => {
  it('жирный, курсив, зачёркнутый, код', () => {
    const root = md('**жирный** и *курсив*, _тоже курсив_, ~~старое~~ и `/spawn`');
    expect(root.querySelector('strong')).toHaveTextContent('жирный');
    expect(root.querySelectorAll('em')).toHaveLength(2);
    expect(root.querySelector('del')).toHaveTextContent('старое');
    expect(root.querySelector('code')).toHaveTextContent('/spawn');
  });

  it('списки, цитата, абзацы и переносы строк', () => {
    const root = md(
      'Привет!\nВторая строка\n\n- строю\n- играю\n\n1. первое\n2. второе\n\n> цитата',
    );
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('p br')).not.toBeNull();
    expect(root.querySelectorAll('ul > li')).toHaveLength(2);
    expect(root.querySelectorAll('ol > li')).toHaveLength(2);
    expect(root.querySelector('blockquote')).toHaveTextContent('цитата');
  });

  it('ссылки: markdown и голые https — с безопасными rel', () => {
    const root = md('[Мой канал](https://youtube.com/@twomc) и https://twitch.tv/twomc.');
    const links = root.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://youtube.com/@twomc');
    expect(links[0]).toHaveTextContent('Мой канал');
    expect(links[0]!.getAttribute('rel')).toMatch(/nofollow/);
    expect(links[0]!.getAttribute('rel')).toMatch(/noopener/);
    expect(links[1]).toHaveAttribute('href', 'https://twitch.tv/twomc');
    // Точка в конце предложения не входит в адрес.
    expect(links[1]).toHaveTextContent(/^https:\/\/twitch\.tv\/twomc$/);
  });

  it('экранирование: \\* — обычная звёздочка', () => {
    const root = md('\\*не курсив\\*');
    expect(root.querySelector('em')).toBeNull();
    expect(root).toHaveTextContent('*не курсив*');
  });
});

describe('SafeMarkdown — защита', () => {
  it('HTML и <script> — только текст, никаких элементов', () => {
    const root = md(
      '<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil"></iframe><b style="color:red">x</b>',
    );
    expect(root.querySelector('script, img, iframe, b, [style], [onerror]')).toBeNull();
    expect(root).toHaveTextContent('<script>alert(1)</script>');
  });

  it('javascript:, data:, vbscript: и относительные ссылки не становятся ссылками', () => {
    const root = md(
      '[a](javascript:alert) [b](data:text/html;base64,PHNjcmlwdD4=) [c](vbscript:x) [d](/admin) [e](JaVaScRiPt:void)',
    );
    expect(root.querySelector('a')).toBeNull();
    expect(root).toHaveTextContent('a b c d e');
    expect(md('[x](javascript:alert(1))').querySelector('a')).toBeNull();
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://twomc.su')).toBe('https://twomc.su/');
    expect(safeHref('mailto:support@twomc.su')).toBe('mailto:support@twomc.su');
  });

  it('картинки не рисуются, заголовки — обычный текст', () => {
    const root = md('![мем](https://example.com/huge.png)\n\n# Огромный заголовок');
    expect(root.querySelector('img, h1, h2, h3')).toBeNull();
    expect(root).toHaveTextContent('![мем](https://example.com/huge.png)');
    expect(root).toHaveTextContent('# Огромный заголовок');
  });

  it('глубокая вложенность ограничена — без падения и бесконечного разбора', () => {
    const root = md('**~~*_глубоко_*~~** и ещё **~~*_второй_*~~**');
    const depth = (element: Element) => {
      let count = 0;
      for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
        if (/^(STRONG|DEL|EM)$/.test(node.tagName)) count += 1;
      }
      return count;
    };
    const deepest = Math.max(...Array.from(root.querySelectorAll('strong, del, em'), depth));
    expect(deepest).toBeLessThanOrEqual(2);
    expect(root).toHaveTextContent('глубоко');
  });

  it('внешняя ссылка из bio проходит через подтверждение перехода', async () => {
    const user = userEvent.setup();
    render(
      <ExternalLinkGuard>
        <SafeMarkdown source="[ReallyWorld](https://reallyworld.ru/news)" />
      </ExternalLinkGuard>,
    );
    await user.click(screen.getByRole('link', { name: 'ReallyWorld' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getAllByText(/reallyworld\.ru/).length).toBeGreaterThan(0);
  });
});
