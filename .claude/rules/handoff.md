# Delegation and handoff

- Использовать `docs/agent-prompts/HANDOFF-TEMPLATE.md` для каждого делегирования.
- Указать цель, scope, запреты, входы, ожидаемые артефакты, проверки и completion criteria.
- Делегировать только дочернему уровню и только релевантной роли.
- Reviewer/QA/Security не исправляют найденное: возвращают evidence-backed findings.
- Если области файлов пересекаются, выполнять задачи последовательно.
- Итог родителю: status, evidence, files changed, checks, risks, blockers, owner approvals.
