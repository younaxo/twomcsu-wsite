-- Публичный числовой discriminator 0000–9999 (ADR-0099): identity `username#0000`.
-- Без слепой регенерации — значение выводится из уже выданного тега:
--   * суффикс уже из 4 цифр (bootstrap `younaxo_#0002`) — сохраняется как есть;
--   * суффикс из 4 hex-символов (`name#4a2b`) — число hex по модулю 10000;
--   * иное (нестандартный тег) — детерминированный хеш id по модулю 10000.
-- Прежний тег сохраняется в "legacyTag", если меняется. Ник уникален и
-- неизменяем, поэтому `username#DDDD` уникален без перебора.

ALTER TABLE "users" ADD COLUMN "discriminator" SMALLINT;
ALTER TABLE "users" ADD COLUMN "legacyTag" VARCHAR(32);

UPDATE "users"
SET "discriminator" = CASE
  WHEN split_part("tag", '#', 2) ~ '^[0-9]{4}$'
    THEN split_part("tag", '#', 2)::INTEGER
  WHEN split_part("tag", '#', 2) ~ '^[0-9a-fA-F]{4}$'
    THEN (('x' || lpad(split_part("tag", '#', 2), 8, '0'))::BIT(32)::INTEGER) % 10000
  ELSE mod(abs(hashtext("id")), 10000)
END;

UPDATE "users"
SET "legacyTag" = "tag"
WHERE "tag" <> "username" || '#' || lpad("discriminator"::TEXT, 4, '0');

UPDATE "users"
SET "tag" = "username" || '#' || lpad("discriminator"::TEXT, 4, '0')
WHERE "tag" <> "username" || '#' || lpad("discriminator"::TEXT, 4, '0');

ALTER TABLE "users" ALTER COLUMN "discriminator" SET NOT NULL;
ALTER TABLE "users"
  ADD CONSTRAINT "users_discriminator_range" CHECK ("discriminator" BETWEEN 0 AND 9999);
