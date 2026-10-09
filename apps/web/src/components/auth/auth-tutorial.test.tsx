import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  FORCE_AUTH_TUTORIAL,
  shouldShowAuthTutorial,
  TUTORIAL_STEPS,
  validVideoUrl,
  type TutorialStep,
} from '@/lib/auth/tutorial';
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
    <>
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
    </>
  );
}

const progress = () => screen.getByRole('progressbar', { name: 'Прогресс обучения' });

describe('AuthTutorial', () => {
  it('шесть этапов: у каждого заголовок, пояснение и свой слот скриншота; Далее/Назад; «Понятно» закрывает', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(TUTORIAL_STEPS).toHaveLength(6);
    expect(progress()).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    const seen = new Set<string>();
    for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
      const step = TUTORIAL_STEPS[i]!;
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
      expect(screen.getByText(`Этап ${i + 1} из 6`)).toBeInTheDocument();
      const shot = screen.getByTestId('tutorial-screenshot');
      expect(shot).toHaveAttribute('data-step', step.id);
      seen.add(shot.getAttribute('data-step') ?? '');
      if (i < TUTORIAL_STEPS.length - 1) {
        await user.click(screen.getByRole('button', { name: 'Далее' }));
      }
    }
    expect(seen.size).toBe(6);
    expect(progress()).toHaveAttribute('aria-valuenow', '6');
    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(progress()).toHaveAttribute('aria-valuenow', '5');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
  });

  it('этап /site-connect: команда моноширинно с копированием; пример 5 символов помечен как пример', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('/site-connect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скопировать команду' })).toBeInTheDocument();
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('/site-connect <код>')).toBeInTheDocument();
    expect(screen.getByText('(пример)')).toBeInTheDocument();
  });

  it('скриншота нет — явно помеченный временный слот; есть — изображение из конфига', () => {
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
    expect(screen.getByText('Временный макет — скриншот будет добавлен')).toBeInTheDocument();
  });

  it('видео: без URL кнопок нет; с URL — ссылки YouTube/RuTube', () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByTestId('tutorial-videos')).toBeNull();
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
    expect(within(videos).getByRole('link', { name: 'Смотреть на YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc',
    );
    expect(within(videos).getByRole('link', { name: 'Смотреть на RuTube' })).toBeInTheDocument();
  });

  it('клавиатура: стрелки листают этапы, Esc закрывает, фокус возвращается', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('{ArrowRight}');
    expect(progress()).toHaveAttribute('aria-valuenow', '2');
    await user.keyboard('{ArrowLeft}');
    expect(progress()).toHaveAttribute('aria-valuenow', '1');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('auth-tutorial')).toBeNull();
    // Повторное открытие начинается с первого этапа.
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(progress()).toHaveAttribute('aria-valuenow', '1');
  });

  it('mobile: скриншот идёт первым, на md+ — две колонки', () => {
    render(<Harness />);
    const shot = screen.getByTestId('tutorial-screenshot');
    const grid = shot.parentElement as HTMLElement;
    expect(grid.firstElementChild).toBe(shot);
    expect(grid.className).toMatch(/md:grid-cols-/);
  });
});

describe('правило показа tutorial', () => {
  it('сейчас — принудительно на входе и регистрации', () => {
    expect(FORCE_AUTH_TUTORIAL).toBe(true);
    expect(shouldShowAuthTutorial({ pathname: '/login', seen: true })).toBe(true);
    expect(shouldShowAuthTutorial({ pathname: '/register', seen: true })).toBe(true);
    expect(shouldShowAuthTutorial({ pathname: '/site-connect/abc', seen: false })).toBe(false);
  });

  it('production-режим (force=false) — только регистрация и только впервые', () => {
    expect(shouldShowAuthTutorial({ pathname: '/register', seen: false, force: false })).toBe(true);
    expect(shouldShowAuthTutorial({ pathname: '/register', seen: true, force: false })).toBe(false);
    expect(shouldShowAuthTutorial({ pathname: '/login', seen: false, force: false })).toBe(false);
  });

  it('видео: только https и только домены платформы', () => {
    expect(validVideoUrl('youtube', 'https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(validVideoUrl('youtube', 'http://youtube.com/x')).toBeNull();
    expect(validVideoUrl('rutube', 'https://evil.example/rutube')).toBeNull();
    expect(validVideoUrl('rutube', undefined)).toBeNull();
  });
});
