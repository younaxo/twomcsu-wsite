# @twomc/api

Backend twomc.su — NestJS 10, Prisma 6, PostgreSQL 16, Redis 7.

Запуск, переменные окружения и архитектура — см. корневой [README](../../README.md)
и [`docs/implementation/`](../../docs/implementation/). Этот пакет не
запускается отдельно от монорепозитория — команды выполняются из корня
(`pnpm dev`, `pnpm db:migrate` и т.д.).

## Команды (из этого каталога)

```bash
pnpm run start:dev     # nest start --watch
pnpm run test          # unit-тесты (src/**/*.spec.ts)
pnpm run test:e2e       # e2e-тесты (test/**/*.e2e-spec.ts), нужен DATABASE_URL
pnpm run db:migrate     # prisma migrate dev (использует корневой .env)
pnpm run db:studio      # prisma studio
```
