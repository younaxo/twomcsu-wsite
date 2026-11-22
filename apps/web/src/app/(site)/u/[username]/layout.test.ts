import { describe, expect, it } from 'vitest';
import { safeHandle } from '@/lib/safe-handle';
import { generateMetadata } from './layout';

describe('профиль: заголовок из ника', () => {
  it('удаляет управляющие символы и bidi-метки до обрезки', () => {
    expect(safeHandle('a‮b⁦c⁩d\u0007e​f')).toBe('abcdef');
    const padded = '‮'.repeat(40) + 'Steve';
    expect(safeHandle(padded)).toBe('Steve');
    expect(safeHandle(encodeURIComponent('Al‮ex\n'))).toBe('Alex');
  });

  it('метаданные не содержат bidi-метки; битый %-escape и длина', () => {
    const meta = generateMetadata({ params: { username: 'x%E2%80%AEy' } });
    expect(meta.title).toBe('xy');
    expect(safeHandle('%zz')).toBe('%zz');
    expect(safeHandle('n'.repeat(50)).length).toBe(32);
  });
});
