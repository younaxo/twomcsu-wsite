import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FallbackImage } from './fallback-image';

describe('FallbackImage', () => {
  it('ошибка загрузки — заглушка вместо битой картинки, alt не растягивается на блок', () => {
    render(
      <div className="relative">
        <FallbackImage src="/api/uploads/x.png" alt="" fill sizes="100vw" unoptimized />
      </div>,
    );
    const img = document.querySelector('img')!;
    fireEvent.error(img);
    const fallback = screen.getByTestId('image-fallback');
    expect(fallback.className).toContain('absolute inset-0');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('img')).toBeNull();
    // Иконка Lucide есть и спрятана от скринридера; текста и alt на блок нет.
    const icon = fallback.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(fallback).not.toHaveAttribute('aria-label');
    expect(fallback).not.toHaveAttribute('role');
    expect(fallback.textContent).toBe('');
  });

  it('смысловой кадр — заглушка с role=img и подписью', () => {
    render(
      <FallbackImage src="/api/uploads/x.png" alt="Спавн" width={10} height={10} unoptimized />,
    );
    fireEvent.error(document.querySelector('img')!);
    expect(screen.getByRole('img', { name: 'Спавн' })).toBe(screen.getByTestId('image-fallback'));
  });

  it('новый src сбрасывает ошибку', () => {
    const { rerender } = render(
      <FallbackImage src="/api/uploads/a.png" alt="" width={10} height={10} unoptimized />,
    );
    fireEvent.error(document.querySelector('img')!);
    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
    rerender(<FallbackImage src="/api/uploads/b.png" alt="" width={10} height={10} unoptimized />);
    expect(document.querySelector('img')).not.toBeNull();
  });

  it('смена src — без кадра заглушки: новый src сразу рендерит img', () => {
    const { rerender } = render(
      <FallbackImage src="/api/uploads/a.png" alt="" width={10} height={10} unoptimized />,
    );
    fireEvent.error(document.querySelector('img')!);
    rerender(<FallbackImage src="/api/uploads/b.png" alt="" width={10} height={10} unoptimized />);
    expect(screen.queryByTestId('image-fallback')).toBeNull();
    expect(document.querySelector('img')).not.toBeNull();
  });

  it('ошибка до гидрации: img уже complete с naturalWidth 0 — заглушка после монтирования', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    try {
      render(
        <FallbackImage src="/api/uploads/x.png" alt="Спавн" width={10} height={10} unoptimized />,
      );
      expect(screen.getByTestId('image-fallback')).toBe(screen.getByRole('img', { name: 'Спавн' }));
      expect(document.querySelector('img')).toBeNull();
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it('загруженная картинка (complete, naturalWidth > 0) заглушку не показывает', () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(10);
    try {
      render(<FallbackImage src="/api/uploads/x.png" alt="" width={10} height={10} unoptimized />);
      expect(screen.queryByTestId('image-fallback')).toBeNull();
      expect(document.querySelector('img')).not.toBeNull();
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });
});
