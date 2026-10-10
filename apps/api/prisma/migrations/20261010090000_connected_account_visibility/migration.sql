-- Привязанные аккаунты (ADR-0095): видимость по провайдеру и аватар. Только добавление.
ALTER TABLE "user_external_accounts" ADD COLUMN "avatarUrl" VARCHAR(512);
ALTER TABLE "user_external_accounts" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
