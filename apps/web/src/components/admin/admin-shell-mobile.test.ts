import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'admin-shell.tsx'), 'utf8');

describe('admin shell mobile layout', () => {
  it('raises control height to 40px on narrow screens', () => {
    expect(source).toContain('max-sm:[--control-h:40px]');
    expect(source).toContain('max-sm:[--control-h-sm:40px]');
  });

  it('keeps the sidebar as a drawer below lg and the main area shrinkable', () => {
    expect(source).toContain('hidden h-[calc(100dvh-1.5rem)]');
    expect(source).toContain('lg:hidden');
    expect(source).toContain('flex min-w-0 flex-1 flex-col');
  });

  it('uses no blur or backdrop effects', () => {
    expect(source).not.toMatch(/backdrop-|blur-/);
  });
});
