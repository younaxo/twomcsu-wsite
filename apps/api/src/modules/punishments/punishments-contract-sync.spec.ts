import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

/// Контракт 7, тест-план п.19 (R80): копия типов API в apps/api совпадает с
/// packages/shared. Файлы читаются как текст (не import), поэтому правило
/// no-restricted-imports не нарушается. Нормализуется поток токенов:
/// комментарии, переносы, кавычки, завершающие запятые, `export`.
const API_ROOT = join(__dirname, '../../..');
const REPO_ROOT = join(API_ROOT, '../..');

const read = (...parts: string[]): string =>
  readFileSync(join(REPO_ROOT, ...parts), 'utf8');

const API_COPY = read(
  'apps/api/src/modules/punishments/api/punishments-api.types.ts',
);
const SHARED = read('packages/shared/src/api/punishments.ts');
const SHARED_COMMON = read('packages/shared/src/api/common.ts');
const SOURCE_TYPES = read(
  'apps/api/src/modules/punishments/punishment.types.ts',
);
const PRISMA_SCHEMA = read('apps/api/prisma/schema.prisma');

/// Единственный допустимый API-only экспорт (раздел 7, п.4).
const API_ONLY_ALLOWLIST = ['IsoDateString'];

interface Decl {
  name: string;
  exported: boolean;
  text: string;
  node: ts.Node;
}

function tokens(text: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    text,
  );
  const out: string[] = [];
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (
      kind === ts.SyntaxKind.StringLiteral ||
      kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      out.push(JSON.stringify(scanner.getTokenValue()));
    } else {
      out.push(scanner.getTokenText());
    }
  }
  // Лишние разделители не различаются: `;` приравнен к `,`, запятая перед
  // закрывающей скобкой отбрасывается, ведущий `|` после `=` отбрасывается.
  const unified = out.map((t) => (t === ';' ? ',' : t));
  const cleaned: string[] = [];
  for (let i = 0; i < unified.length; i += 1) {
    const t = unified[i];
    const next = unified[i + 1];
    if (t === ',' && (next === '}' || next === ']' || next === ')')) continue;
    if (t === ',' && next === undefined) continue;
    if (t === '|' && cleaned[cleaned.length - 1] === '=') continue;
    cleaned.push(t);
  }
  return cleaned.join(' ');
}

function declsOf(source: string, fileName: string): Map<string, Decl> {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const result = new Map<string, Decl>();
  for (const stmt of file.statements) {
    let name: string | undefined;
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      name = stmt.name.text;
    } else if (ts.isVariableStatement(stmt)) {
      const first = stmt.declarationList.declarations[0];
      if (ts.isIdentifier(first.name)) name = first.name.text;
    }
    if (!name) continue;
    const exported =
      ts.canHaveModifiers(stmt) &&
      (ts.getModifiers(stmt) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
    // Текст без ключевого слова export и без комментариев (скаинер их пропускает).
    const raw = stmt.getText(file).replace(/^export\s+/, '');
    result.set(name, { name, exported, text: tokens(raw), node: stmt });
  }
  return result;
}

function exportedNames(decls: Map<string, Decl>): string[] {
  return [...decls.values()]
    .filter((d) => d.exported)
    .map((d) => d.name)
    .sort();
}

/// Значения `as const`-массива по имени.
function arrayValues(decls: Map<string, Decl>, name: string): string[] {
  const decl = decls.get(name);
  if (!decl) throw new Error(`нет объявления ${name}`);
  const values: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isArrayLiteralExpression(n)) {
      for (const el of n.elements) {
        if (ts.isStringLiteral(el)) values.push(el.text);
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(decl.node);
  return values;
}

function prismaEnum(name: string): string[] {
  const match = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(PRISMA_SCHEMA);
  if (!match) throw new Error(`нет enum ${name}`);
  return match[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

const apiDecls = declsOf(API_COPY, 'api.ts');
const sharedDecls = declsOf(SHARED, 'shared.ts');
const commonDecls = declsOf(SHARED_COMMON, 'common.ts');

describe('R80: копии типов API наказаний', () => {
  it('множества экспортируемых имён совпадают (кроме allowlist)', () => {
    const apiNames = exportedNames(apiDecls).filter(
      (n) => !API_ONLY_ALLOWLIST.includes(n),
    );
    const sharedNames = exportedNames(sharedDecls);
    const onlyApi = apiNames.filter((n) => !sharedNames.includes(n));
    const onlyShared = sharedNames.filter((n) => !apiNames.includes(n));
    expect({ onlyApi, onlyShared }).toEqual({ onlyApi: [], onlyShared: [] });
    expect(apiNames.length).toBeGreaterThan(20);
  });

  it('запрет API-only экспортов: допустим только IsoDateString', () => {
    const sharedNames = exportedNames(sharedDecls);
    const extra = exportedNames(apiDecls).filter(
      (n) => !sharedNames.includes(n),
    );
    expect(extra.sort()).toEqual([...API_ONLY_ALLOWLIST].sort());
  });

  it('каждое общее объявление совпадает по нормализованному тексту', () => {
    const different: string[] = [];
    for (const name of exportedNames(sharedDecls)) {
      const a = apiDecls.get(name);
      const s = sharedDecls.get(name);
      if (!a || !s || a.text !== s.text) different.push(name);
    }
    expect(different).toEqual([]);
  });

  it('IsoDateString в копии равен объявлению из common.ts', () => {
    const local = apiDecls.get('IsoDateString');
    const common = commonDecls.get('IsoDateString');
    expect(local).toBeDefined();
    expect(common).toBeDefined();
    expect(local!.text).toBe(common!.text);
  });

  it('локальный ApiErrorBody (без export) равен объявлению из common.ts', () => {
    const local = apiDecls.get('ApiErrorBody');
    const common = commonDecls.get('ApiErrorBody');
    expect(local).toBeDefined();
    expect(local!.exported).toBe(false);
    expect(common).toBeDefined();
    expect(local!.text).toBe(common!.text);
  });

  it('shared не объявляет IsoDateString и ApiErrorBody сам, а импортирует', () => {
    expect(sharedDecls.has('IsoDateString')).toBe(false);
    expect(sharedDecls.has('ApiErrorBody')).toBe(false);
    expect(SHARED).toMatch(/from '\.\/common'/);
  });

  it('shared/index.ts реэкспортирует ./api/punishments', () => {
    expect(read('packages/shared/src/index.ts')).toMatch(
      /export \* from '\.\/api\/punishments';/,
    );
  });

  it('нормализатор различает реальные расхождения и не реагирует на форматирование', () => {
    const base = declsOf("export const X = ['A', 'B'] as const;", 'x.ts').get(
      'X',
    )!;
    const reformatted = declsOf(
      '// комментарий\nexport const X = [\n  "A",\n  "B",\n] as const;',
      'x.ts',
    ).get('X')!;
    const changed = declsOf(
      "export const X = ['A', 'C'] as const;",
      'x.ts',
    ).get('X')!;
    expect(reformatted.text).toBe(base.text);
    expect(changed.text).not.toBe(base.text);
  });

  describe('значения совпадают с источником и Prisma', () => {
    const sourceDecls = declsOf(SOURCE_TYPES, 'source.ts');

    it('PUNISHMENT_KINDS = punishment.types.ts = enum MinecraftPunishmentKind', () => {
      const api = arrayValues(apiDecls, 'PUNISHMENT_KINDS');
      expect(api).toEqual(arrayValues(sharedDecls, 'PUNISHMENT_KINDS'));
      expect(api).toEqual(arrayValues(sourceDecls, 'PUNISHMENT_KINDS'));
      expect([...api].sort()).toEqual(
        [...prismaEnum('MinecraftPunishmentKind')].sort(),
      );
    });

    it('PUNISHMENT_VIEW_STATUSES + DELETED_AT_SOURCE = статусы источника = enum Prisma', () => {
      const view = arrayValues(apiDecls, 'PUNISHMENT_VIEW_STATUSES');
      expect(view).toEqual(
        arrayValues(sharedDecls, 'PUNISHMENT_VIEW_STATUSES'),
      );
      const full = arrayValues(sourceDecls, 'PUNISHMENT_STATUSES');
      expect([...view, 'DELETED_AT_SOURCE']).toEqual(full);
      expect([...full].sort()).toEqual(
        [...prismaEnum('MinecraftPunishmentStatus')].sort(),
      );
      // Публичные и «мои» статусы не содержат DELETED_AT_SOURCE.
      expect(view).not.toContain('DELETED_AT_SOURCE');
      const staff = apiDecls.get('PunishmentStaffStatus')!;
      expect(staff.text).toContain('"DELETED_AT_SOURCE"');
    });

    it('PUNISHMENT_REASON_KEYS и PUNISHMENT_ERROR_CODES совпадают в обеих копиях', () => {
      for (const name of [
        'PUNISHMENT_REASON_KEYS',
        'PUNISHMENT_ERROR_CODES',
        'PUNISHMENT_PUBLIC_KINDS',
      ]) {
        expect(arrayValues(apiDecls, name)).toEqual(
          arrayValues(sharedDecls, name),
        );
        expect(arrayValues(apiDecls, name).length).toBeGreaterThan(0);
      }
      expect(arrayValues(apiDecls, 'PUNISHMENT_REASON_KEYS')).toEqual([
        'cheats',
        'abuse',
        'spam',
        'advertising',
        'evasion',
        'other',
        'rules',
      ]);
    });
  });
});
