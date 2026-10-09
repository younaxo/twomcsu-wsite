import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/// ADR-0075: собственный курсор — только для pointer:fine, у каждого — fallback
/// на стандартное ключевое слово, недоступность перекрывает «указатель».
const css = readFileSync(path.resolve(__dirname, 'globals.css'), 'utf8');
const block = css.slice(css.indexOf('@media (pointer: fine)'));

describe('собственный курсор', () => {
  it('включается только для мыши/тачпада', () => {
    expect(css).toContain('@media (pointer: fine)');
    expect(css.indexOf("url('/assets/cursors/")).toBeGreaterThan(
      css.indexOf('@media (pointer: fine)'),
    );
  });

  it.each([
    ['default.svg', 'auto'],
    ['pointer.svg', 'pointer'],
    ['text.svg', 'text'],
    ['grab.svg', 'grab'],
    ['grabbing.svg', 'grabbing'],
    ['not-allowed.svg', 'not-allowed'],
  ])('%s — с fallback «%s» и файлом в public', (file, keyword) => {
    expect(block).toMatch(new RegExp(`url\\('/assets/cursors/${file}'\\)[^;]*,\\s*${keyword};`));
    expect(existsSync(path.resolve(__dirname, '../../public/assets/cursors', file))).toBe(true);
  });

  it('недоступность объявлена после «указателя» и текста', () => {
    expect(block.lastIndexOf('not-allowed.svg')).toBeGreaterThan(block.lastIndexOf('pointer.svg'));
    expect(block.lastIndexOf('not-allowed.svg')).toBeGreaterThan(block.lastIndexOf('text.svg'));
  });
});
