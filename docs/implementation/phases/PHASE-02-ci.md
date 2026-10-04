# PHASE 02 — CI / development infrastructure

## Сделано

- `.github/workflows/ci.yml` — job `quality` (install → lint → format:check →
  typecheck → prisma validate (no-op до PHASE 04) → test → build) и job
  `dependency-audit` (`pnpm audit --audit-level=high`, информативный — см. ADR-0014).
- `.github/workflows/codeql.yml` — CodeQL для `javascript-typescript`, по push/PR в
  `main` и еженедельно по расписанию.
- `.github/workflows/gitleaks.yml` — secret scanning по push/PR (репозиторий
  публичный — `gitleaks-action` работает без лицензии).
- `.github/workflows/actionlint.yml` — линт самих workflow-файлов при их изменении.
- `.github/dependabot.yml` — еженедельные обновления npm и github-actions
  зависимостей.
- Все YAML-файлы синтаксически проверены локально (`js-yaml`, временная зависимость,
  удалена после проверки — не осталась в `package.json`).

## Не входит в эту фазу

- Service-контейнеры Postgres/Redis в CI для integration-тестов — добавляются в
  PHASE 04 вместе с Prisma schema и первыми реальными тестами, использующими БД.
- Блокирующий dependency audit — PHASE 26 (см. ADR-0014).

## Проверка (что реально выполнено в этой сессии)

CI запускается на GitHub Actions при push/PR — локально выполнить его нельзя,
поэтому результат проверяется после push по реальному статусу workflow в PR, а
не предполагается. Синтаксис workflow-файлов проверен локально парсером YAML.
