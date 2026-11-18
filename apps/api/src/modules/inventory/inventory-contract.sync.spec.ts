import { readFileSync } from 'fs';
import { resolve } from 'path';

/// L5: локальное зеркало контракта (apps/api не импортирует @twomc/shared)
/// не должно разойтись с `packages/shared/src/api/inventory.ts`.
const LOCAL = resolve(__dirname, 'inventory-contract.ts');
const SHARED = resolve(
  __dirname,
  '../../../../../packages/shared/src/api/inventory.ts',
);

/// Удаляет комментарии (`//`, `///`, `/* */`, JSDoc), не трогая строковые
/// литералы: расхождение только в комментариях не считается расхождением
/// контракта.
function stripComments(source: string): string {
  const quotes = ["'", '"', '`'];
  const backslash = String.fromCharCode(92);
  const newline = String.fromCharCode(10);
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quotes.includes(c)) {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        j += source[j] === backslash ? 2 : 1;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== newline) i += 1;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      out += ' ';
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function parseDeclarations(source: string): Map<string, string> {
  const text = stripComments(source)
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

function declarations(path: string): Map<string, string> {
  return parseDeclarations(readFileSync(path, 'utf8'));
}

describe('sync-тест: комментарии не влияют на сравнение', () => {
  const plain = ['export interface A { x: string; y: number }'].join('\n');

  it('строчные, тройные и блочные комментарии игнорируются', () => {
    const noisy = [
      '/// заголовок',
      '/** JSDoc',
      ' * многострочный */',
      'export interface A {',
      '  // поле x',
      '  x: string; /* хвост */',
      '  /// поле y',
      '  y: number; // конец',
      '}',
    ].join('\n');
    expect(parseDeclarations(noisy)).toEqual(parseDeclarations(plain));
  });

  it('значимое отличие в коде не скрывается комментарием', () => {
    const changed = 'export interface A { x: string; y: string } // number';
    expect(parseDeclarations(changed)).not.toEqual(parseDeclarations(plain));
  });

  it('// внутри строкового литерала не считается комментарием', () => {
    const withUrl = "export const URL_X = 'http://a.b/c' // хвост";
    const bare = "export const URL_X = 'http://a.b/c'";
    expect(parseDeclarations(withUrl)).toEqual(parseDeclarations(bare));
    expect(parseDeclarations(withUrl).get('URL_X')).toContain('http://a.b/c');
  });
});

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
