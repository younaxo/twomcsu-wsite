import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  PROJECT_SCREENSHOTS,
  getScreenshot,
  screenshotSrcSet,
} from '@/lib/site/project-screenshots';
import {
  CAROUSEL_INTERVAL_MS,
  CAROUSEL_RESUME_MS,
  ScreenshotCarousel,
} from './screenshot-carousel';

/// Реальные скриншоты TwoMC (D3, ADR-0096): реестр и Auth-карусель.

const originalMatchMedia = window.matchMedia;
function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const active = () =>
  document
    .querySelector('[data-testid=screenshot-carousel] [data-active]')
    ?.getAttribute('data-slide');

const renderCarousel = (props: Partial<Parameters<typeof ScreenshotCarousel>[0]> = {}) =>
  render(
    <TooltipProvider delayDuration={0}>
      <ScreenshotCarousel {...props} />
    </TooltipProvider>,
  );

beforeEach(() => mockReducedMotion(false));
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.useRealTimers();
});

describe('Реестр скриншотов', () => {
  it('все 8 реальных кадров, уникальные id, порядок по priority', () => {
    expect(PROJECT_SCREENSHOTS).toHaveLength(8);
    expect(new Set(PROJECT_SCREENSHOTS.map((shot) => shot.id)).size).toBe(8);
    expect(PROJECT_SCREENSHOTS.map((shot) => shot.priority)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(PROJECT_SCREENSHOTS.map((shot) => shot.source)).size).toBe(8);
  });

  it('3D-казино — файл 2026-10-10_13.28.43.png и в числе первых кадров', () => {
    const casino = getScreenshot('3d-casino');
    expect(casino.source).toBe('2026-10-10_13.28.43.png');
    expect(casino.title).toBe('3D-казино');
    expect(PROJECT_SCREENSHOTS.indexOf(casino)).toBeLessThan(2);
  });

  it('alt — осмысленные описания, без «image1» и «screenshot»', () => {
    for (const shot of PROJECT_SCREENSHOTS) {
      expect(shot.alt.length).toBeGreaterThan(30);
      expect(shot.alt).not.toMatch(/^(image|screenshot|minecraft screenshot)/i);
    }
  });

  it('srcset без upscale: максимум — исходные 1920 px; путь — каталог кадра на CDN', () => {
    const set = screenshotSrcSet(getScreenshot('spawn-day'), 'avif');
    expect(set).toContain('/spawn-day/640.avif 640w');
    expect(set).toContain('/spawn-day/1920.avif 1920w');
    expect(set).not.toMatch(/2560|3840/);
  });
});

describe('Карусель скриншотов', () => {
  it('первый кадр — самый сильный, загружается с приоритетом; соседний — заранее, остальные — нет', () => {
    renderCarousel();
    expect(active()).toBe('spawn-day');
    const images = Array.from(document.querySelectorAll('img[data-screenshot]'));
    expect(images.map((img) => img.getAttribute('data-screenshot'))).toEqual([
      'spawn-day',
      '3d-casino',
    ]);
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    // intrinsic размеры — без CLS
    expect(images[0]).toHaveAttribute('width', '1920');
    expect(images[0]).toHaveAttribute('height', '1009');
  });

  it('вперёд, назад и точки', () => {
    renderCarousel();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий кадр' }));
    expect(active()).toBe('3d-casino');
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий кадр' }));
    expect(active()).toBe('spawn-day');
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий кадр' }));
    expect(active()).toBe('spawn-hills');
    fireEvent.click(screen.getByRole('button', { name: /Кадр 4:/ }));
    expect(active()).toBe('spawn-hall');
    expect(screen.getByRole('button', { name: /Кадр 4:/ })).toHaveAttribute('aria-current', 'true');
    // Без подписей на кадре: название — только для screen reader.
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('4 из 8: Здание «Открытие TwoMC»')).toHaveClass('sr-only');
  });

  it('клавиатура: ←/→/Home/End', () => {
    renderCarousel();
    const region = screen.getByTestId('screenshot-carousel');
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(active()).toBe('3d-casino');
    fireEvent.keyDown(region, { key: 'End' });
    expect(active()).toBe('spawn-hills');
    fireEvent.keyDown(region, { key: 'Home' });
    expect(active()).toBe('spawn-day');
  });

  it('свайп на touch', () => {
    renderCarousel();
    const frame = document.querySelector('[data-slide]')!.parentElement!;
    fireEvent.touchStart(frame, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 200 }] });
    expect(active()).toBe('3d-casino');
    fireEvent.touchStart(frame, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 320 }] });
    expect(active()).toBe('spawn-day');
  });

  it('автопрокрутка каждые 6 с; пауза на наведении и кнопкой «Остановить»', () => {
    vi.useFakeTimers();
    renderCarousel();
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS));
    expect(active()).toBe('3d-casino');
    const region = screen.getByTestId('screenshot-carousel');
    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS * 3));
    expect(active()).toBe('3d-casino');
    fireEvent.mouseLeave(region);
    fireEvent.click(screen.getByRole('button', { name: 'Остановить автопрокрутку' }));
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS * 3));
    expect(active()).toBe('3d-casino');
    fireEvent.click(screen.getByRole('button', { name: 'Включить автопрокрутку' }));
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS));
    expect(active()).toBe('spawn-town');
  });

  it('после ручного переключения автопрокрутка ждёт дольше и мягко продолжается', () => {
    vi.useFakeTimers();
    renderCarousel();
    // Ручное переключение кнопкой (фокус уходит с карусели — пауза только по времени).
    fireEvent.click(screen.getByRole('button', { name: 'Следующий кадр' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Следующий кадр' }));
    expect(active()).toBe('3d-casino');
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS));
    expect(active()).toBe('3d-casino');
    act(() => vi.advanceTimersByTime(CAROUSEL_RESUME_MS));
    expect(active()).toBe('spawn-town');
  });

  it('reduced motion — без автопрокрутки и без кнопки паузы; ручное управление остаётся', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    renderCarousel();
    act(() => vi.advanceTimersByTime(CAROUSEL_INTERVAL_MS * 3));
    expect(active()).toBe('spawn-day');
    expect(screen.queryByRole('button', { name: /автопрокрутку/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий кадр' }));
    expect(active()).toBe('3d-casino');
  });

  it('кадр не загрузился — нейтральная поверхность с названием, без битой картинки', () => {
    renderCarousel();
    const img = document.querySelector('img[data-screenshot="spawn-day"]')!;
    fireEvent.error(img);
    const fallback = within(
      document.querySelector('[data-slide="spawn-day"]') as HTMLElement,
    ).getByTestId('screenshot-fallback');
    expect(fallback).toHaveTextContent('Спавн TwoMC');
  });

  it('только кадр и управление поверх: без заголовков, описаний и логотипа', () => {
    renderCarousel({ onOpen: () => undefined });
    const region = screen.getByTestId('screenshot-carousel');
    expect(within(region).queryByRole('heading')).toBeNull();
    expect(region).not.toHaveTextContent(getScreenshot('spawn-day').description);
    expect(region.querySelector('img[data-logo]')).toBeNull();
    expect(
      within(region).getByRole('button', { name: 'Открыть «Спавн TwoMC» крупно' }),
    ).toBeInTheDocument();
    // Активный кадр — с осмысленным alt (подписи на экране нет).
    expect(region.querySelector('[data-active] img')).toHaveAttribute(
      'alt',
      getScreenshot('spawn-day').alt,
    );
  });

  it('mobile (compact): кадр и точки, без стрелок и подписей', () => {
    renderCarousel({ variant: 'compact' });
    const region = screen.getByTestId('screenshot-carousel');
    expect(region).toHaveAttribute('data-variant', 'compact');
    expect(within(region).queryByRole('heading')).toBeNull();
    expect(within(region).getByTestId('carousel-dots').children).toHaveLength(8);
    expect(within(region).queryByRole('button', { name: 'Следующий кадр' })).toBeNull();
  });
});
