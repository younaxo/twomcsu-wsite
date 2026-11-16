# TwoMC — правила работы Claude Code

Общайся с владельцем по-русски. Основной сеанс запускается из корня репозитория командой `claude --agent twomc-chief`.

## Восстановление контекста

До любых изменений выполни read-only проверку: прочитай `docs/implementation/CHECKPOINT.md`, затем проверь status, commit, branch/worktree и remote. CHECKPOINT и старые отчёты — исторический контекст, а не разрешение на автономную работу.

Для крупной задачи прочитай релевантные документы: `docs/implementation/ROADMAP.md`, `docs/product-audit/ROADMAP.md`, `docs/implementation/DECISIONS.md`, `docs/implementation/RISKS.md`, `docs/implementation/CHANGELOG.md`, требования Donation Privileges и Level System, visual direction и technical architecture.

## Неприкосновенные ограничения

- Не удаляй и не перезаписывай чужие локальные или неотслеживаемые изменения.
- Не запускай NIGHT MODE, Agent Teams, циклы, фоновые автономные сессии или расписания без новой явной команды владельца.
- Не выполняй миграции/seed БД, `git push`, merge/rebase, deploy, публикацию, изменение roadmap или irreversible external action без новой явной команды владельца.
- Никогда не читай, не печатай, не передавай и не коммить секреты из `.env*`, `C:\Users\younaxo\.twomc\secrets` и credential-файлов.
- Используй `pnpm@9.15.9`; не меняй lockfile ради настройки среды.
- Donation Privileges и Level System не реализуются без отдельного решения владельца.

## Решения владельца (постоянные, действуют во всех этапах)

Источник: `docs/agent-prompts/04-STAGE-00-01-02-AUTONOMOUS.md`, раздел 0 (2026-11-16). Эти решения уточняют ограничения выше там, где они прямо это говорят.

- **Git полностью на агенте:** ветки, коммиты, push, PR, ожидание и исправление CI, merge по правилам `main`, синхронизация `main`. Владельца в рутинные Git-операции не привлекать. Force-push, `reset --hard`, `clean`, удаление чужих веток и файлов, обход rulesets и правка `.github/workflows` без разрешения владельца — по-прежнему запрещены.
- **Правила `main`:** обязательны PR и зелёные `Lint, typecheck, test, build`, CodeQL, gitleaks; запрещены force-push и удаление; прямой push в `main` запрещён всем; одобрение Code Owner не требуется (approvals = 0). CODEOWNERS остаётся.
- **Bypass permissions у владельца включён постоянно.** Не добавлять `disableBypassPermissionsMode` ни в `.claude/settings.json`, ни в `settings.local.json`, ни в user settings; не менять `defaultMode` / `permissions.defaultMode` так, чтобы bypass стал недоступен. Если ключ найден — не трогать без команды владельца и сообщить. Предложения отключить bypass «для безопасности» отклонять и записывать в отчёт как вопрос владельцу.
- **Deny-правила действуют и в bypass:** force-push, `reset --hard`, `clean`, deploy, чтение `.env*` и хранилища секретов, миграции и seed на production. Не удалять и не ослаблять.
- **Admin-токен владельца** не используется для рутинной работы. Разовые исключения 2026-11-16 (ruleset `main-protection`, слияние #139 → #140 → #141) исчерпаны; дальнейшая работа — только под машинным аккаунтом с ограниченными правами (`docs/runbooks/agent-github-access.md`).
- **Hard gates без отдельной команды владельца:** Donation Privileges, Level System, реальные платежи, production-деплой, покупка ресурсов, платные API, миграции на production, изменение roadmap.

## Иерархия и handoff

`twomc-chief` делегирует директорам, директора — лидам, лиды — специалистам. Координаторы не пишут продуктовый код. Reviewer, QA и Security работают независимо и read-only. Параллельность разрешена только для непересекающихся областей; начальный лимит — 3 подагента.

Каждая передача использует `docs/agent-prompts/HANDOFF-TEMPLATE.md`. Каждый уровень возвращает: результат, доказательства, изменённые файлы, проверки, риски, блокеры и требуемые решения владельца. Успех нельзя заявлять без фактической проверки.
