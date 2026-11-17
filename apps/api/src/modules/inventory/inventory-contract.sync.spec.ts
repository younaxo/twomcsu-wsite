import { readFileSync } from 'fs';
import { resolve } from 'path';

/// L5: локальное зеркало контракта (apps/api не импортирует @twomc/shared)
/// не должно разойтись с `packages/shared/src/api/inventory.ts`.
const LOCAL = resolve(__dirname, 'inventory-contract.ts');
const SHARED = resolve(
  __dirname,
  '../../../../../packages/shared/src/api/inventory.ts',
);

function declarations(path: string): Map<string, string> {
  const text = readFileSync(path, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .replace(/[,;](?=\})/g, '')
    .replace(/;/g, '');
  const result = new Map<string, string>();
  for (const chunk of text.split('export').slice(1)) {
    const match = /^(?:interface|type|const)([A-Za-z0-9_]+)/.exec(chunk);
    if (!match) continue;
    result.set(match[1], chunk.replace(/=\|/, '='));
  }
  return result;
}

describe('inventory-contract.ts и packages/shared: синхронность', () => {
  const local = declarations(LOCAL);
  const shared = declarations(SHARED);

  it('в обоих файлах есть объявления', () => {
    expect(local.size).toBeGreaterThan(10);
    expect(shared.size).toBeGreaterThan(10);
  });

  it('набор имён совпадает', () => {
    expect([...local.keys()].sort()).toEqual([...shared.keys()].sort());
  });

  it('каждое объявление совпадает по содержимому', () => {
    for (const [name, body] of local) {
      expect({ name, body }).toEqual({ name, body: shared.get(name) });
    }
  });
});
