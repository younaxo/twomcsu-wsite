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

## Иерархия и handoff

`twomc-chief` делегирует директорам, директора — лидам, лиды — специалистам. Координаторы не пишут продуктовый код. Reviewer, QA и Security работают независимо и read-only. Параллельность разрешена только для непересекающихся областей; начальный лимит — 3 подагента.

Каждая передача использует `docs/agent-prompts/HANDOFF-TEMPLATE.md`. Каждый уровень возвращает: результат, доказательства, изменённые файлы, проверки, риски, блокеры и требуемые решения владельца. Успех нельзя заявлять без фактической проверки.
