import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/// ADR-0180, раздел 2.6: статическая проверка миграции среза 2 (колонки
/// скрытия выдавшего и индексы публичного списка). БД не нужна.
const MIGRATIONS_DIR = join(__dirname, '../../../prisma/migrations');
const MIGRATION_NAME = '20261117040000_punishments_public_indexes';

const NEW_COLUMNS = [
  'issuerHidden',
  'issuerHiddenById',
  'issuerHiddenAt',
  'issuerHiddenReason',
];
const NEW_INDEXES = [
  'minecraft_punishments_subjectName_lower_idx',
  'minecraft_punishments_public_startedAt_id_idx',
  'minecraft_punishments_startedAt_id_idx',
];

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/// Код без комментариев и без содержимого строковых литералов.
function codeOf(raw: string): string {
  return stripComments(raw).replace(/'(?:[^']|'')*'/g, "''");
}

function statementsOf(raw: string): string[] {
  return codeOf(raw)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('миграция punishments_public_indexes (ADR-0180, 2.6)', () => {
  const raw = readFileSync(
    join(MIGRATIONS_DIR, MIGRATION_NAME, 'migration.sql'),
    'utf8',
  );
  const statements = statementsOf(raw);

  it('метка миграции позже занятой инвентарём 20261117030000', () => {
    expect(MIGRATION_NAME > '20261117030000').toBe(true);
    const names = readdirSync(MIGRATIONS_DIR).filter((n) => /^\d{14}_/.test(n));
    expect(names).toContain('20261117020000_punishments_mirror');
  });

  it('только ALTER TABLE ... ADD COLUMN и CREATE INDEX', () => {
    expect(statements.length).toBe(7);
    for (const statement of statements) {
      const isAddColumn =
        /^ALTER TABLE "minecraft_punishments" ADD COLUMN "\w+" /.test(
          statement,
        );
      const isCreateIndex =
        /^CREATE INDEX "\w+" ON "minecraft_punishments" /.test(statement);
      expect(isAddColumn || isCreateIndex).toBe(true);
    }
  });

  it('нет разрушающих и изменяющих данные операторов (комментарии не учитываются)', () => {
    const code = codeOf(raw);
    for (const word of [
      'DROP',
      'DELETE',
      'UPDATE',
      'TRUNCATE',
      'INSERT',
      'RENAME',
      'CASCADE',
      'CONCURRENTLY',
      'ALTER COLUMN',
      'SET DEFAULT',
      'DROP NOT NULL',
    ]) {
      expect(code).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
  });

  it('M1: три CREATE INDEX идут ПЕРЕД четырьмя ADD COLUMN (ACCESS EXCLUSIVE берётся в конце транзакции)', () => {
    const kinds = statements.map((s) =>
      s.startsWith('CREATE INDEX') ? 'I' : 'C',
    );
    expect(kinds.join('')).toBe('IIICCCC');
  });

  it('очиститель комментариев и литералов не даёт ложных срабатываний', () => {
    const cleaned = codeOf(
      "-- DROP TABLE x\n/* DELETE FROM y */\nSELECT 'DROP' ;",
    );
    expect(cleaned).not.toMatch(/DROP|DELETE/);
  });

  it('добавляет ровно четыре колонки скрытия выдавшего, остальное не трогает', () => {
    const added = statements
      .map((s) => /ADD COLUMN "(\w+)"/.exec(s)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(added).toEqual(NEW_COLUMNS);
    const code = codeOf(raw);
    expect(code).toMatch(/"issuerHidden" BOOLEAN NOT NULL DEFAULT false/);
    expect(code).toMatch(/"issuerHiddenById" TEXT;/);
    expect(code).toMatch(/"issuerHiddenAt" TIMESTAMP\(3\);/);
    expect(code).toMatch(/"issuerHiddenReason" VARCHAR\(200\);/);
  });

  it('создаёт три индекса: выражение, частичный и сортировка', () => {
    const created = statements
      .map((s) => /^CREATE INDEX "(\w+)"/.exec(s)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(created).toEqual(NEW_INDEXES);
    // Литералы в коде заменены на '', поэтому форму предиката сверяем по сырому тексту.
    expect(raw).toContain('lower("subjectName") text_pattern_ops');
    expect(raw).toContain(
      `WHERE "kind" IN ('BAN', 'MUTE') AND "isHidden" = false AND "silent" = false AND "ipBan" = false AND "status" <> 'DELETED_AT_SOURCE'`,
    );
    expect(raw).not.toMatch(/CREATE UNIQUE INDEX/i);
  });

  it('ни одна миграция каталога не удаляет эти индексы и колонки', () => {
    const dirs = readdirSync(MIGRATIONS_DIR).filter((n) => /^\d{14}_/.test(n));
    expect(dirs.length).toBeGreaterThan(1);
    for (const dir of dirs) {
      const code = codeOf(
        readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'),
      );
      for (const index of NEW_INDEXES) {
        expect(code).not.toMatch(
          new RegExp(`DROP\\s+INDEX[^;]*"${index}"`, 'i'),
        );
      }
      for (const column of NEW_COLUMNS) {
        expect(code).not.toMatch(
          new RegExp(`DROP\\s+COLUMN[^;]*"${column}"`, 'i'),
        );
      }
    }
  });
});
