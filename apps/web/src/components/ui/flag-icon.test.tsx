import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlagIcon } from './flag-icon';

/// Исходники интерфейса без тестов.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('FlagIcon', () => {
  it('SVG-флаги декоративны, у каждого экземпляра свои clipPath', () => {
    const { container } = render(
      <>
        <FlagIcon code="ru" />
        <FlagIcon code="gb" />
        <FlagIcon code="gb" />
      </>,
    );
    const flags = container.querySelectorAll('svg[data-flag]');
    expect(flags).toHaveLength(3);
    flags.forEach((flag) => expect(flag).toHaveAttribute('aria-hidden'));
    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('emoji в интерфейсе (ТЗ §20)', () => {
  it('в исходниках нет emoji и флагов-индикаторов вместо иконок', () => {
    const emoji = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const offenders = sources(join(__dirname, '..', '..')).filter((file) =>
      emoji.test(readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('числовые поля (ADR-0087)', () => {
  it('в исходниках нет type="number" — у него нативные стрелки браузера; вместо — NumberStepper или inputMode="numeric"', () => {
    const offenders = sources(join(__dirname, '..', '..')).filter((file) =>
      /type=["']number["']/.test(readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});
