import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrencyIcon } from './currency-icon';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CurrencyIcon', () => {
  it('рубин по умолчанию — локальный SVG, без запроса к CDN', () => {
    const { container } = render(<CurrencyIcon currency="RUBY" />);
    const img = container.querySelector('img[data-currency="RUBY"]');
    expect(img).toHaveAttribute('src', '/assets/currencies/ruby.svg');
    expect(img?.className).not.toMatch(/pixelated/);
  });

  it('флаг NEXT_PUBLIC_RUBY_ICON_ON_CDN=true — PNG с CDN', () => {
    vi.stubEnv('NEXT_PUBLIC_RUBY_ICON_ON_CDN', 'true');
    const { container } = render(<CurrencyIcon currency="RUBY" />);
    const img = container.querySelector('img[data-currency="RUBY"]');
    expect(img?.getAttribute('src')).toMatch(/minecraft\/resourspack\/currencies\/ruby\.png$/);
    expect(img?.className).toMatch(/pixelated/);
  });

  it('монета баланса по-прежнему с CDN', () => {
    const { container } = render(<CurrencyIcon currency="MONEY" />);
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/currencies\/money\.png$/);
  });

  it('ошибка загрузки — встроенная SVG-заглушка вместо битой картинки', () => {
    const { container } = render(<CurrencyIcon currency="RUBY" decorative={false} />);
    fireEvent.error(screen.getByRole('img', { name: 'Рубин' }));
    expect(container.querySelector('img')).toBeNull();
    const fallback = screen.getByRole('img', { name: 'Рубин' });
    expect(fallback).toHaveAttribute('data-fallback', 'true');
  });

  it('декоративная иконка при ошибке — заглушка скрыта от скринридеров', () => {
    const { container } = render(<CurrencyIcon currency="RUBY" />);
    fireEvent.error(container.querySelector('img')!);
    const fallback = container.querySelector('svg[data-fallback]');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
  });
});
