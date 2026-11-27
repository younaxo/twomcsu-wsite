# Delegation and handoff

- Использовать `docs/agent-prompts/HANDOFF-TEMPLATE.md` для каждого делегирования.
- Указать цель, scope, запреты, входы, ожидаемые артефакты, проверки и completion criteria.
- Делегировать только дочернему уровню и только релевантной роли.
- Reviewer/QA/Security не исправляют найденное: возвращают evidence-backed findings.
- Если области файлов пересекаются, выполнять задачи последовательно.
- Итог родителю: status, evidence, files changed, checks, risks, blockers, owner approvals.
- Перед постановкой прогона на VDS-раннер (`infrastructure/vds-runner/run-remote.sh`) проверить `git status --short` в worktree: новые файлы кода и тестов должны быть в git (`git add`, лучше коммит), иначе раннер их не видит и прогон ложно падает (пример: 27.11 e2e сорван TS2307 из-за неотслеживаемого `vote-webhook-ip.ts`). Исключение — артефакты `vds-runner-out/`.
