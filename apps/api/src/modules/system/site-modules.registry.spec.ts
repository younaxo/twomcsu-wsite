import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { SITE_MODULES } from './site-modules.registry';

/// Реестр модулей — отражение кода (ADR-0082): каждый ключ `@SiteModule`
/// есть в реестре, и каждый не-ядерный модуль реестра помечает хотя бы один
/// реальный контроллер.
function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('SITE_MODULES', () => {
  const used = new Set<string>();
  for (const file of controllerFiles(join(__dirname, '..'))) {
    for (const match of readFileSync(file, 'utf-8').matchAll(
      /@SiteModule\('([a-z-]+)'\)/g,
    )) {
      used.add(match[1]!);
    }
  }

  it('ключи уникальны', () => {
    const keys = SITE_MODULES.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('каждая метка контроллера есть в реестре', () => {
    const known = new Set(SITE_MODULES.map((item) => item.key));
    expect([...used].filter((key) => !known.has(key))).toEqual([]);
  });

  it('каждый не-ядерный модуль реестра закрывает реальные маршруты', () => {
    const unused = SITE_MODULES.filter(
      (item) => item.tier !== 'core' && !used.has(item.key),
    ).map((item) => item.key);
    expect(unused).toEqual([]);
  });

  it('ядро не помечает маршруты (guard его никогда не закрывает)', () => {
    const core = SITE_MODULES.filter((item) => item.tier === 'core').map(
      (item) => item.key,
    );
    expect(core.filter((key) => used.has(key))).toEqual([]);
  });
});
