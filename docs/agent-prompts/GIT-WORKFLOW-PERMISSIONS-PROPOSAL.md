# Предложение: контролируемый Git-workflow для twomc-chief

**Версия:** 2 (учтено независимое ревью Platform & Integrations Director, PHASE 02).
**Статус:** PROPOSED, не применено. Требует решения владельца.
**Основание:** `docs/agent-prompts/02-FULL-PROJECT-AUDIT.md` v2.0, §3.
**Важно:** действующий `.claude/settings.json` этим документом не меняется. Chief не выдаёт себе права на push сам; изменения применяет владелец.

## 1. Текущее состояние (проверено 2026-11-15)

- `.claude/settings.json` запрещает `git push *`, `git merge *`, `git rebase *`, `git reset --hard *`, `git clean *`, `gh pr merge *` (Bash и PowerShell).
- В рабочем дереве владельца незакоммиченная правка: удалены `disableBypassPermissionsMode` и `disableAutoMode`.
- `main` **не защищена**: `GET .../branches/main/protection` -> 404, rulesets: 0.
- `gh` авторизован полным токеном владельца: scopes `repo`, `workflow`, `gist`, `read:org`; права `admin` на репозиторий. Такой токен может сам снять защиту ветки и менять workflows.

## 2. Принцип: три барьера, главный — идентичность

1. **Идентичность (главный).** Агент работает не под токеном владельца, а под отдельным fine-grained PAT или GitHub App только для `younaxo/twomcsu-wsite`: `Contents: read/write`, `Pull requests: read/write`, `Metadata: read`, `Actions: read`, `Checks: read`. Без `Administration`, без `Workflows`, без `Secrets`. Тогда ruleset на `main` агент снять не может, а изменения `.github/workflows/**` не пройдут.
2. **GitHub ruleset на `main`.** Без bypass для токена агента.
3. **Claude Code permissions.** Сопоставление текста команды — дополнительный барьер; вариации (`git -c ... push`, `sh -c`, `env`) его обходят, поэтому он не заменяет пункты 1 и 2.
4. **Режим сессии.** `disableBypassPermissionsMode` и `disableAutoMode` включены.

## 3. Шаги владельца на GitHub

**Ruleset для `main`** (Settings -> Rules -> Rulesets):

- Require a pull request before merging; решить, нужен ли обязательный approval (автор и владелец — один человек).
- Require status checks: `Lint, typecheck, test, build`, `Analyze (javascript-typescript)`, `gitleaks`. Проверить точные имена по последнему run.
- **Не** включать в required `Dependency security audit`, пока в `ci.yml:136` стоит `continue-on-error: true` (он всегда зелёный), и `actionlint` (запускается только при изменении workflows и иначе висел бы вечно).
- Require branches to be up to date before merging.
- Block force pushes; restrict deletions.
- Bypass-список пуст (кроме владельца, если нужен экстренный доступ).

**CODEOWNERS** для `.github/**`, `.claude/**`, `infrastructure/**`, `apps/api/prisma/migrations/**`.

**Токен агента** по разделу 2.1; использовать его в сессии Chief вместо личного `gh auth`.

## 4. Предлагаемые изменения `.claude/settings.json`

Заменить запрет `Bash(git push *)` на набор ниже; все прочие существующие deny сохранить. Перед включением каждый шаблон проверить на установленной версии Claude Code (в частности, совпадает ли `Bash(cmd *)` с командой без аргументов).

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "disableAutoMode": "disable",
    "allow": [
      "Bash(git push -u origin feature/*)",
      "Bash(git push -u origin fix/*)",
      "Bash(git push -u origin chore/*)",
      "Bash(git push -u origin docs/*)",
      "Bash(git push origin feature/*)",
      "Bash(git push origin fix/*)",
      "Bash(git push origin chore/*)",
      "Bash(git push origin docs/*)",
      "Bash(gh pr create *)",
      "Bash(gh pr edit *)",
      "Bash(gh pr view *)",
      "Bash(gh pr checks *)",
      "Bash(gh pr list *)",
      "Bash(gh run view *)",
      "Bash(gh run list *)"
    ],
    "deny": [
      "Bash(git push)",
      "Bash(git push origin)",
      "Bash(git push *main*)",
      "Bash(git push *refs/heads/*)",
      "Bash(git push *+*)",
      "Bash(git push *:*)",
      "Bash(git push *--force*)",
      "Bash(git push *-f *)",
      "Bash(git push *-f)",
      "Bash(git push *--delete*)",
      "Bash(git push *-d *)",
      "Bash(git push *--mirror*)",
      "Bash(git push *--all*)",
      "Bash(git push *--tags*)",
      "Bash(git * push *)",
      "Bash(git -* push *)",
      "Bash(*sh -c *git*)",
      "Bash(env *git*)",
      "Bash(gh pr merge)",
      "Bash(gh pr merge *)",
      "Bash(gh pr close)",
      "Bash(gh pr close *)",
      "Bash(gh pr review *)",
      "Bash(gh api *)",
      "Bash(gh auth *)",
      "Bash(gh secret *)",
      "Bash(gh variable *)",
      "Bash(gh release *)",
      "Bash(gh workflow *)",
      "Bash(gh run rerun *)",
      "Bash(gh run cancel *)",
      "Bash(gh repo *)",
      "Edit(.claude/**)",
      "Write(.claude/**)",
      "Edit(.git/**)",
      "Write(.git/**)",
      "Edit(.github/workflows/**)",
      "Write(.github/workflows/**)",
      "PowerShell(git push *)",
      "PowerShell(gh *)"
    ]
  }
}
```

Пояснения:

- Deny имеет приоритет над allow. `git push origin feature/x:refs/heads/main` и `feature/x:main` блокируются шаблонами `*:*`, `*refs/heads/*`, `*main*` — push разрешён только формой `git push [-u] origin <ветка>` без refspec.
- `*main*` блокирует и ветки с подстрокой `main` (например, `chore/maintenance`): такие ветки не создавать.
- `gh api` запрещён целиком: через `-f/-F/--input` и `graphql` он выполняет POST/мутации без `-X`. Для чтения CI достаточно `gh pr checks`, `gh run view/list`.
- Запрет записи в `.claude/**`, `.git/**`, `.github/workflows/**` не даёт агенту ослабить собственные правила, хуки или CI. **Следствие:** правки агентной конфигурации и workflows после включения выполняет только владелец (или отдельная сессия с его явным разрешением).
- Merge в `main`, закрытие PR, approve и любые изменения настроек репозитория остаются за владельцем.

## 5. Процесс после включения

1. Утверждённая задача -> ветка `feature/`, `fix/`, `chore/` или `docs/` от актуального `main`.
2. Работа подчинённых в непересекающихся областях.
3. Локальные проверки -> небольшие коммиты на русском.
4. `git push -u origin <ветка>` -> `gh pr create` -> ожидание GitHub Actions (`gh pr checks`).
5. Исправления только в пределах утверждённого scope.
6. Отчёт о готовности к слиянию; merge выполняет владелец.

## 6. Решения владельца

1. Создать отдельный ограниченный токен агента (раздел 2.1) — без него остальные барьеры обходимы.
2. Включить ruleset на `main` и CODEOWNERS (раздел 3).
3. Применить раздел 4 к `.claude/settings.json` и вернуть `disableBypassPermissionsMode`/`disableAutoMode` либо подтвердить, что их удаление намеренное.
4. Перезапустить сессию `claude --agent twomc-chief`, чтобы правила загрузились, и проверить шаблоны на тестовой ветке.
