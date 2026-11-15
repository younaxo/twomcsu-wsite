# Предложение: контролируемый Git-workflow для twomc-chief

**Статус:** PROPOSED, не применено. Требует решения владельца.
**Основание:** `docs/agent-prompts/02-FULL-PROJECT-AUDIT.md` v2.0, §3.
**Важно:** действующий `.claude/settings.json` этим документом не меняется. Chief не выдаёт себе права на push сам; изменение применяет владелец.

## 1. Текущее состояние (проверено 2026-11-15)

- `.claude/settings.json` запрещает `git push *`, `git merge *`, `git rebase *`, `git reset --hard *`, `git clean *`, `gh pr merge *` (Bash и PowerShell).
- В рабочем дереве владельца есть незакоммиченная правка: удалены `disableBypassPermissionsMode` и `disableAutoMode`.
- Ветка `main` на GitHub **не защищена** (`GET /repos/younaxo/twomcsu-wsite/branches/main/protection` -> 404 «Branch not protected»). Сейчас любой push с правами записи может изменить `main` напрямую.

## 2. Принцип

Правила разрешений Claude Code сопоставляют текст команды. Это дополнительный барьер, а не граница безопасности: вариации вроде `git -c ... push`, переменных окружения или `sh -c` могут обходить шаблоны. Поэтому:

1. **Главный барьер — GitHub**: ruleset или branch protection на `main`.
2. **Второй барьер — Claude Code**: точечное разрешение push только в рабочие ветки, запрет всего, что касается `main`, force, удаления веток и merge.
3. **Третий барьер — режим**: Bypass и Auto mode выключены, чтобы deny нельзя было обойти режимом сессии.

## 3. Шаг владельца на GitHub (обязательно до включения push)

Создать ruleset для `main` (Settings -> Rules -> Rulesets), репозиторий публичный — функция доступна:

- Require a pull request before merging.
- Require status checks to pass: `Lint, typecheck, test, build`, `Dependency security audit`, `Analyze (javascript-typescript)`, `gitleaks`.
- Block force pushes.
- Restrict deletions.
- Без bypass-списка для ботов и интеграций.

## 4. Предлагаемые изменения `.claude/settings.json`

Заменить запрет `Bash(git push *)` и `PowerShell(git push *)` на набор ниже. Все прочие deny сохранить без изменений.

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
      "Bash(gh run view *)",
      "Bash(gh run list *)"
    ],
    "deny": [
      "Bash(git push)",
      "Bash(git push origin)",
      "Bash(git push * main)",
      "Bash(git push * main *)",
      "Bash(git push *:main*)",
      "Bash(git push *HEAD:main*)",
      "Bash(git push *--force*)",
      "Bash(git push *-f *)",
      "Bash(git push *-f)",
      "Bash(git push *--delete*)",
      "Bash(git push *-d *)",
      "Bash(git push * :*)",
      "Bash(git push *--mirror*)",
      "Bash(git push *--all*)",
      "Bash(git push *--tags*)",
      "Bash(gh pr merge *)",
      "Bash(gh repo edit *)",
      "Bash(gh api *protection*)",
      "Bash(gh api *rulesets*)",
      "Bash(gh api * -X *)",
      "Bash(gh api * --method *)",
      "Bash(gh workflow disable *)",
      "PowerShell(git push *)",
      "PowerShell(gh pr merge *)"
    ]
  }
}
```

Пояснения:

- Deny имеет приоритет над allow, поэтому `git push origin chore/x:main` попадает под `*:main*` и запрещается.
- Голые `git push` и `git push origin` запрещены: с ветки `main` они отправили бы `main`. Push разрешён только с явным именем рабочей ветки.
- PowerShell-push оставлен полностью запрещённым: workflow выполняется через Bash, второй путь не нужен.
- `gh api` с изменяющими методами запрещён, чтобы нельзя было снять защиту ветки или отключить проверки.
- Merge в `main` остаётся только за владельцем.

## 5. Процесс после включения

1. Утверждённая задача -> ветка `feature/` / `fix/` / `chore/` / `docs/` от актуального `main`.
2. Работа подчинённых в непересекающихся областях.
3. Локальные проверки -> небольшие коммиты на русском.
4. `git push -u origin <ветка>` -> `gh pr create` -> ожидание GitHub Actions.
5. Исправления только в пределах утверждённого scope.
6. Отчёт о готовности к слиянию; merge выполняет владелец.

## 6. Решения владельца

1. Включить ruleset на `main` (раздел 3).
2. Применить раздел 4 к `.claude/settings.json` и вернуть `disableBypassPermissionsMode`/`disableAutoMode`, либо подтвердить, что их удаление намеренное.
3. После применения перезапустить сессию `claude --agent twomc-chief`, чтобы правила загрузились.
