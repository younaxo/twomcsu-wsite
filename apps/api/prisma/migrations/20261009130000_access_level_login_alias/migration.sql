-- ADR-0062: уровень доступа пользователя — отдельный от priority ролей параметр.
ALTER TABLE "users" ADD COLUMN "accessLevel" INTEGER NOT NULL DEFAULT 0;

-- ADR-0061: точечные alias'ы входа (у всех login = username; исключение — bootstrap #2).
CREATE TABLE "login_aliases" (
    "alias" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_aliases_pkey" PRIMARY KEY ("alias")
);

CREATE INDEX "login_aliases_userId_idx" ON "login_aliases"("userId");

ALTER TABLE "login_aliases" ADD CONSTRAINT "login_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
