import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  shouldShowAuthTutorial,
  TUTORIAL_STEPS,
  validVideoUrl,
  type TutorialStep,
} from '@/lib/auth/tutorial';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthTutorial } from './auth-tutorial';

function Harness({
  steps,
  videos = { youtube: null, rutube: null },
  onClose = () => undefined,
}: {
  steps?: TutorialStep[];
  videos?: { youtube: string | null; rutube: string | null };
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <TooltipProvider delayDuration={0}>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      <AuthTutorial
        open={open}
        steps={steps}
        videos={videos}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onClose();
        }}
      />
    </TooltipProvider>
  );
}

/// Номер текущего шага — по aria-current в навигации (1…6).
const current = () => {
  const nav = screen.getByRole('navigation', { name: 'Шаги обучения' });
  const buttons = within(nav).getAllByRole('button');
  return buttons.findIndex((button) => button.getAttribute('aria-current') === 'step') + 1;
};

describe('AuthTutorial', () => {
  it('шесть шагов: у каждого заголовок, пояснение и свой слот скриншота; Далее/Назад; «Понятно» закрывает', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(TUTORIAL_STEPS).toHaveLength(6);
    expect(current()).toBe(1);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    const seen = new Set<string>();
    for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
      const step = TUTORIAL_STEPS[i]!;
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
      expect(screen.getByText(`Шаг ${i + 1} из 6`)).toBeInTheDocument();
      const shot = screen.getByTestId('tutorial-screenshot');
      expect(shot).toHaveAttribute('data-step', step.id);
      seen.add(shot.getAttribute('data-step') ?? '');
      if (i < TUTORIAL_STEPS.length - 1) {
        await user.click(screen.getByRole('button', { name: 'Далее' }));
      }
    }
    expect(seen.size).toBe(6);
    expect(current()).toBe(6);
    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(current()).toBe(5);
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
  });

  it('сегменты сверху кликабельны: переход на любой шаг; состояния пройден/текущий/впереди', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const nav = screen.getByRole('navigation', { name: 'Шаги обучения' });
    const segments = within(nav).getAllByRole('button');
    expect(segments).toHaveLength(6);
    await user.click(
      within(nav).getByRole('button', { name: `Шаг 4: ${TUTORIAL_STEPS[3]!.title}` }),
    );
    expect(current()).toBe(4);
    expect(screen.getByRole('heading', { name: TUTORIAL_STEPS[3]!.title })).toBeInTheDocument();
    expect(segments.map((segment) => segment.getAttribute('data-state'))).toEqual([
      'completed',
      'completed',
      'completed',
      'active',
      'upcoming',
      'upcoming',
    ]);
    // Назад к первому — тоже кликом по сегменту; все шаги доступны свободно.
    await user.click(segments[0]!);
    expect(current()).toBe(1);
    expect(segments.every((segment) => !segment.hasAttribute('disabled'))).toBe(true);
  });

  it('этап /site-connect: команда моноширинно с копированием; пример 5 символов помечен как пример', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('/site-connect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скопировать команду' })).toBeInTheDocument();
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('/site-connect <код>')).toBeInTheDocument();
    // Пример — шаблон формата, а не выдуманный код (A12).
    expect(screen.getByText('X0XX0')).toBeInTheDocument();
    expect(screen.getByText('X — буква, 0 — цифра')).toBeInTheDocument();
  });

  it('форматы кодов (A12): длина в названиях шагов, шаблон на шаге 3, нигде нет «15 символов»', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const titles = TUTORIAL_STEPS.map((step) => step.title);
    expect(titles[2]).toBe('Получите код привязки (16 символов)');
    expect(titles[3]).toBe('Введите код привязки (16 символов)');
    expect(titles[4]).toBe('Подтвердите Minecraft (5 символов)');
    expect(JSON.stringify(TUTORIAL_STEPS)).not.toMatch(/15 символ|15-символ|K7Q2M/);
    const nav = screen.getByRole('navigation', { name: 'Шаги обучения' });
    await user.click(within(nav).getByRole('button', { name: /^Шаг 3:/ }));
    expect(screen.getByText('XXX-000-X0X0-0X0')).toBeInTheDocument();
  });

  it('скриншота нет — помеченный слот (не фейковый скриншот); есть — изображение из конфига', () => {
    const steps: TutorialStep[] = [
      {
        ...TUTORIAL_STEPS[0]!,
        image: { src: '/assets/tutorial/register.webp', alt: 'Регистрация' },
      },
    ];
    const { unmount } = render(<Harness steps={steps} />);
    expect(screen.getByRole('img', { name: 'Регистрация' })).toBeInTheDocument();
    unmount();
    render(<Harness />);
    expect(screen.getByText('Скриншот появится позже')).toBeInTheDocument();
  });

  it('видео: обе кнопки видны всегда; без URL — недоступны с «Видео готовится», не ведут на #', () => {
    const { unmount } = render(<Harness />);
    const empty = screen.getByTestId('tutorial-videos');
    expect(empty).toHaveTextContent('Видеоинструкция');
    for (const name of ['YouTube', 'RuTube']) {
      const button = within(empty).getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toHaveAttribute('href');
    }
    expect(within(empty).queryAllByRole('link')).toHaveLength(0);
    unmount();
    render(
      <Harness
        videos={{
          youtube: 'https://www.youtube.com/watch?v=abc',
          rutube: 'https://rutube.ru/video/x/',
        }}
      />,
    );
    const videos = screen.getByTestId('tutorial-videos');
    expect(within(videos).getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc',
    );
    expect(within(videos).getByRole('link', { name: 'RuTube' })).toHaveAttribute(
      'href',
      'https://rutube.ru/video/x/',
    );
  });

  it('клавиатура: стрелки листают шаги, Esc закрывает, повторное открытие — с первого шага', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('{ArrowRight}');
    expect(current()).toBe(2);
    await user.keyboard('{ArrowLeft}');
    expect(current()).toBe(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(current()).toBe(1);
  });

  it('layout: скриншот первым (mobile — вертикально), на lg+ — скриншот и инструкция рядом', () => {
    render(<Harness />);
    const shot = screen.getByTestId('tutorial-screenshot');
    const grid = shot.parentElement as HTMLElement;
    expect(grid.firstElementChild).toBe(shot);
    expect(grid.className).toMatch(/lg:grid-cols-/);
  });
});

describe('правило показа tutorial', () => {
  it('сам открывается только в регистрации и один раз за вкладку; на входе — нет', () => {
    expect(shouldShowAuthTutorial({ pathname: '/register', shown: false })).toBe(true);
    expect(shouldShowAuthTutorial({ pathname: '/register', shown: true })).toBe(false);
    expect(shouldShowAuthTutorial({ pathname: '/login', shown: false })).toBe(false);
    expect(shouldShowAuthTutorial({ pathname: '/site-connect/abc', shown: false })).toBe(false);
    expect(shouldShowAuthTutorial({ pathname: '/forgot-password', shown: false })).toBe(false);
  });

  it('видео: только https и только домены платформы', () => {
    expect(validVideoUrl('youtube', 'https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(validVideoUrl('youtube', 'http://youtube.com/x')).toBeNull();
    expect(validVideoUrl('rutube', 'https://evil.example/rutube')).toBeNull();
    expect(validVideoUrl('rutube', undefined)).toBeNull();
  });
});
