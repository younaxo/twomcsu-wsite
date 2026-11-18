import { readFileSync } from 'fs';
import { join } from 'path';

/// Q50, ADR-0174: статическая проверка миграции переноса прав заметок. БД не нужна.
const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261117010000_reports_notes_permissions_backfill/migration.sql',
);

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

describe('миграция reports_notes_permissions_backfill (Q50)', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  const sql = stripComments(raw);
  // Строковые литералы ('reports.delete' — это ключ, а не оператор DELETE).
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('не содержит разрушающих операторов (комментарии не учитываются)', () => {
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/\bDELETE\b/i);
    expect(code).not.toMatch(/\bUPDATE\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bALTER\b/i);
  });

  it('очиститель комментариев не даёт ложных срабатываний', () => {
    const cleaned = stripComments(
      '-- DROP TABLE x\n/* DELETE FROM y */\nSELECT 1;',
    );
    expect(cleaned).not.toMatch(/DROP|DELETE/);
  });

  it('все вставки идемпотентны: ON CONFLICT DO NOTHING у каждой', () => {
    const inserts = sql.match(/\bINSERT INTO\b/gi) ?? [];
    const guards = sql.match(/ON CONFLICT DO NOTHING/gi) ?? [];
    expect(inserts).toHaveLength(3);
    expect(guards).toHaveLength(inserts.length);
  });

  it('выдача только по effect ALLOW, DENY не копируется', () => {
    const grants = sql.match(/WHERE old_rp\."effect" = 'ALLOW'/g) ?? [];
    expect(grants).toHaveLength(2);
    expect(sql).not.toMatch(/DENY/);
  });

  it('соответствия: delete -> notes.edit, notes.pin -> notes.unpin', () => {
    expect(sql).toMatch(
      /old_p\."key" = 'reports\.delete'[\s\S]*?new_p\."key" = 'reports\.notes\.edit'/,
    );
    expect(sql).toMatch(
      /old_p\."key" = 'reports\.notes\.pin'[\s\S]*?new_p\."key" = 'reports\.notes\.unpin'/,
    );
  });

  it('создаёт оба права в модуле reports', () => {
    expect(sql).toMatch(/'reports\.notes\.edit', 'reports'/);
    expect(sql).toMatch(/'reports\.notes\.unpin', 'reports'/);
  });
});
