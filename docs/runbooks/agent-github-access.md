# Однократное подключение ограниченного доступа агента к GitHub

Основание: `docs/product-audit/MASTER-ROADMAP-2026.md` (этап 00), схема `docs/phase-03/GITHUB-RULESETS-AND-CHIEF-GIT-WORKFLOW.md` (v3.1).
Цель: Chief сам отправляет ветки и создаёт PR, но не может изменить `main`, слить PR без одобрения владельца, изменить workflows, rulesets и настройки.

Уже сделано (2026-11-15): rulesets `main-protection`, `all-branches-integrity`, `tags-protection`; Dependabot alerts; этот PR добавляет CODEOWNERS (`* @younaxo`).

## Шаги владельца (один раз)

1. Создать машинный аккаунт GitHub (например, `twomc-chief-bot`), включить 2FA.
2. Пригласить его в `younaxo/twomcsu-wsite` как collaborator (Settings -> Collaborators, право Write) и принять приглашение под ботом.
3. Под ботом создать токен: classic PAT только со scope `public_repo` (без `workflow`), срок до 90 дней. Если при создании fine-grained токена репозиторий доступен — Contents RW, Pull requests RW, Metadata R, без Workflows и Administration.
4. В PowerShell на машине разработки (токен временно в файле вне репозитория, после — удалить файл). Глобальный gitconfig не меняется: токен бота сохраняется в Git Credential Manager под логином бота, а remote `agent` содержит этот логин в URL:

```powershell
git -C C:\Users\younaxo\Documents\twomcsu-wsite\twomcsu-wsite remote add agent https://twomc-chief-bot@github.com/younaxo/twomcsu-wsite.git
$env:GH_CONFIG_DIR = "$env:USERPROFILE\.twomc\gh-bot"
Get-Content "$env:USERPROFILE\.twomc\secrets\bot-token.txt" | gh auth login --hostname github.com --git-protocol https --with-token
"protocol=https`nhost=github.com`nusername=twomc-chief-bot`npassword=$(Get-Content "$env:USERPROFILE\.twomc\secrets\bot-token.txt")`n" | git credential approve
Remove-Item "$env:USERPROFILE\.twomc\secrets\bot-token.txt"
```

5. Запускать сессию агента с `GH_CONFIG_DIR=%USERPROFILE%\.twomc\gh-bot` (Chief добавит это в задачу Zed).
6. Разрешить Chief применить локальные правила по схеме v3.1, раздел 5.3: заменить запрет `git push *` разрешением только `git push [-u] agent <feature|fix|chore|docs>/...`; убрать из `.claude/settings.local.json` разрешения `gh api *`, `gh pr *`, `gh repo *`, `gh run *`, `git remote *`.

## Проверка после подключения

Пробы из раздела 8 схемы (локальные — Chief; серверные под токеном бота — владелец): push в `main`, force-push, удаление ветки, тег и изменение workflow отклоняются GitHub; PR бота до одобрения — `REVIEW_REQUIRED`.

## Откат

Отозвать токен бота и удалить его из collaborators; удалить remote `agent`.
