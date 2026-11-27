import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COMMAND_ARG_TYPES,
  DEFAULT_COMMAND_FORMS,
  DEFAULT_COMMAND_ROOTS,
  FORBIDDEN_COMMAND_ROOTS,
  RENDERED_COMMAND_MAX_LENGTH,
} from './command-template';

/// R155 / Q112: белый список сайта не шире белого списка плагина Bridge.
/// Исходники плагина читаются ТОЛЬКО как данные фикстуры (plugins/** не
/// меняется): при расхождении тест падает, значения нужно выровнять.
const BRIDGE = join(
  __dirname,
  '../../../../../plugins/bridge/src/main/java/ru/twomc/bridge',
);
const protocol = readFileSync(join(BRIDGE, 'Protocol.java'), 'utf8');
const policy = readFileSync(join(BRIDGE, 'CommandPolicy.java'), 'utf8');

const javaStrings = (block: string): string[] =>
  [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    m[1].replace(/\\\\/g, '\\'),
  );

function listOf(name: string): string[] {
  const m = new RegExp(`${name}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\);`).exec(
    protocol,
  );
  if (!m) throw new Error(`Protocol.java: не найден ${name}`);
  return javaStrings(m[1]);
}

describe('паритет белого списка сайта и плагина Bridge (R155, Q112)', () => {
  it('формы команд по умолчанию совпадают с Protocol.DEFAULT_TEMPLATES', () => {
    expect([...DEFAULT_COMMAND_FORMS].sort()).toEqual(
      listOf('DEFAULT_TEMPLATES').sort(),
    );
  });

  it('корни по умолчанию совпадают с Protocol.DEFAULT_ROOTS и корнями форм', () => {
    expect([...DEFAULT_COMMAND_ROOTS].sort()).toEqual(
      listOf('DEFAULT_ROOTS').sort(),
    );
    const formRoots = new Set(
      DEFAULT_COMMAND_FORMS.map((f) => f.split(' ')[0]),
    );
    expect([...formRoots].sort()).toEqual([...DEFAULT_COMMAND_ROOTS].sort());
  });

  it('запретные корни плагина входят в запретные корни сайта', () => {
    const site = new Set(FORBIDDEN_COMMAND_ROOTS);
    const missing = listOf('FORBIDDEN_ROOTS').filter((r) => !site.has(r));
    expect(missing).toEqual([]);
  });

  it('типы аргументов (регулярные выражения) совпадают с CommandPolicy.TYPES', () => {
    const start = policy.indexOf('TYPES = Map.of(');
    const end = policy.indexOf('LITERAL_ALT');
    expect(start).toBeGreaterThan(-1);
    const block = policy.slice(start, end);
    const plugin: Record<string, string> = {};
    for (const m of block.matchAll(
      /"(\w+)",\s*Pattern\.compile\("((?:[^"\\]|\\.)*)"\)/g,
    )) {
      plugin[m[1]] = m[2].replace(/\\\\/g, '\\');
    }
    expect(Object.keys(plugin).length).toBeGreaterThan(0);
    expect(COMMAND_ARG_TYPES).toEqual(plugin);
  });

  it('предел длины команды совпадает с Protocol.COMMAND_MAX_LENGTH', () => {
    const m = /COMMAND_MAX_LENGTH\s*=\s*(\d+)/.exec(protocol);
    expect(Number(m?.[1])).toBe(RENDERED_COMMAND_MAX_LENGTH);
  });
});
