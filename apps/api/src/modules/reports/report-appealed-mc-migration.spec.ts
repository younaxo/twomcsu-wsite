import { readFileSync } from 'fs';
import { join } from 'path';

/// Срез l1-02: статическая проверка миграции связи обжалования с наказанием
/// зеркала (expand-only, Q28). БД не нужна.
const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261124130000_report_appealed_mc_punishment/migration.sql',
);

const code = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('миграция report_appealed_mc_punishment', () => {
  it('только расширение: нет DROP, RENAME, DELETE, UPDATE, TRUNCATE, NOT NULL', () => {
    // Ссылочные действия FK и предикаты IS NOT NULL убираем до проверки.
    const ddl = code
      .replace(/ON DELETE SET NULL ON UPDATE CASCADE/g, '')
      .replace(/IS NOT NULL/g, '');
    expect(ddl).not.toMatch(/\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE)\b/i);
    expect(ddl).not.toMatch(/NOT NULL/i);
  });

  it('добавляет nullable-колонку, индекс, FK и CHECK на одну связь', () => {
    expect(code).toMatch(
      /ALTER TABLE "reports" ADD COLUMN "appealedMinecraftPunishmentId" TEXT;/,
    );
    expect(code).toContain('reports_appealedMinecraftPunishmentId_idx');
    expect(code).toMatch(
      /FOREIGN KEY \("appealedMinecraftPunishmentId"\) REFERENCES "minecraft_punishments"\("id"\) ON DELETE SET NULL/,
    );
    expect(code).toMatch(
      /reports_one_appealed_punishment" CHECK \("appealedPunishmentId" IS NULL OR "appealedMinecraftPunishmentId" IS NULL\)/,
    );
  });

  it('частичный уникальный индекс только по открытым статусам', () => {
    const match =
      /CREATE UNIQUE INDEX "reports_open_mc_appeal_uniq"[^;]+;/.exec(code);
    expect(match).not.toBeNull();
    const statement = match?.[0] ?? '';
    expect(statement).toContain("'PENDING', 'IN_REVIEW', 'WAITING_RESPONSE'");
    expect(statement).not.toMatch(/'(RESOLVED|REJECTED|CLOSED)'/);
    expect(statement).toContain('"type" = \'PUNISHMENT_APPEAL\'');
  });
});
