import { readFileSync } from 'fs';
import { join } from 'path';

/// Статическая проверка миграции inventory_core (ADR-0179, Q28/Q43). БД не нужна.
const PRISMA_DIR = join(__dirname, '../../../prisma');
const MIGRATION = join(
  PRISMA_DIR,
  'migrations/20261117030000_inventory_core/migration.sql',
);

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

describe('миграция inventory_core (expand-only)', () => {
  const sql = stripComments(readFileSync(MIGRATION, 'utf8'));
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  it('содержит только CREATE TABLE, CREATE INDEX и ADD CONSTRAINT', () => {
    expect(statements.length).toBe(6);
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE TABLE "|CREATE (UNIQUE )?INDEX "|ALTER TABLE "(player_inventories|inventory_privacy)" ADD CONSTRAINT ")/,
      );
    }
  });

  it('не содержит разрушающих и изменяющих данные операторов', () => {
    for (const word of [
      'DROP',
      'DELETE',
      'TRUNCATE',
      'UPDATE',
      'INSERT',
      'RENAME',
      'ALTER COLUMN',
    ]) {
      const code = sql
        .replace(/--.*$/gm, '')
        .replace(/ON (DELETE|UPDATE) CASCADE/g, '');
      expect(code).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
  });

  it('внешние ключи на users(id) с каскадным удалением', () => {
    const fks = statements.filter((s) => s.includes('FOREIGN KEY'));
    expect(fks).toHaveLength(2);
    for (const fk of fks) {
      expect(fk).toContain('REFERENCES "users"("id") ON DELETE CASCADE');
    }
  });

  it('соответствует schema.prisma: таблицы, уникальный ключ, столбцы', () => {
    const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
    expect(schema).toContain('@@map("player_inventories")');
    expect(schema).toContain('@@map("inventory_privacy")');
    expect(schema).toContain('@@unique([userId, serverSlug, grp])');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "player_inventories_userId_serverSlug_grp_key" ON "player_inventories"("userId", "serverSlug", "grp")',
    );
    for (const column of [
      '"serverSlug" VARCHAR(32) NOT NULL',
      '"grp" VARCHAR(8) NOT NULL',
      '"epoch" VARCHAR(64) NOT NULL',
      '"slots" JSONB NOT NULL',
      '"contentHash" VARCHAR(64) NOT NULL',
      '"inventoryPublic" BOOLEAN NOT NULL DEFAULT false',
      '"enderPublic" BOOLEAN NOT NULL DEFAULT false',
    ]) {
      expect(sql).toContain(column);
    }
  });

  it('в таблицах нет столбца UUID игрока (UUID не хранится)', () => {
    expect(sql).not.toMatch(/"uuid"/i);
  });
});
