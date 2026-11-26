#!/usr/bin/env bash
# Фильтр снимка --worktree (подключать через `source`). wt_denied <путь-относительно-корня-репозитория>: код 0 = ИСКЛЮЧИТЬ из снимка.
# Исключается: секреты и ключи (.env* кроме шаблонов .env.example/.sample/.template/.dist, .npmrc, .netrc, .pgpass, id_rsa*, id_ed25519*, *.pem, *.key,
# *.p12, *.pfx, *.jks, *.keystore, *.p8, *.kdbx, service-account*.json, *credentials*, имена, оканчивающиеся на secret/secrets), дампы и базы
# (*.sql КРОМЕ prisma/migrations/**/migration.sql, *.dump, *.sqlite, *.sqlite3, *.db) и сборочный мусор (node_modules, .next, .turbo, dist, coverage, *.tsbuildinfo).
# Регистр не учитывается. Исходники вроде secret-box.ts не затрагиваются (имя должно ОКАНЧИВАТЬСЯ на secret/secrets без расширения).
wt_denied() {
  local p="${1,,}" b d
  b="${p##*/}"
  case "$b" in
    .env.example|.env.sample|.env.template|.env.dist) ;;                      # шаблоны без значений нужны проекту
    .env|.env.*) return 0 ;;
  esac
  case "$b" in
    .npmrc|.netrc|.pgpass|.git-credentials|id_rsa*|id_ed25519*|id_ecdsa*|id_dsa*) return 0 ;;
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.p8|*.kdbx|service-account*.json|*credentials*) return 0 ;;
    *secret|*secrets) return 0 ;;
    *.dump|*.sqlite|*.sqlite3|*.db|*.tsbuildinfo) return 0 ;;
    *.sql) [[ "$p" =~ (^|/)prisma/migrations/[^/]+/migration\.sql$ ]] || return 0 ;;
  esac
  d="/$p"
  case "$d" in
    */node_modules/*|*/.next/*|*/.turbo/*|*/dist/*|*/coverage/*|*/.git/*|*/secret/*|*/secrets/*|*/credentials/*) return 0 ;;
  esac
  return 1
}
