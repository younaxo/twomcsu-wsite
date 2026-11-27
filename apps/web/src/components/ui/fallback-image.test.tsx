import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(fallback).toHaveTextContent('');
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
});
