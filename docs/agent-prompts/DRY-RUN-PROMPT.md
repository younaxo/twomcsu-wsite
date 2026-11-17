# Read-only hierarchy dry-run

Goal: доказать маршрут `twomc-chief → twomc-director-engineering → twomc-lead-backend → twomc-reviewer` без изменений файлов.

1. Chief передаёт Engineering Director проверку package manager проекта.
2. Director передаёт Backend Lead задачу прочитать корневой `package.json`.
3. Backend Lead передаёт Reviewer независимое подтверждение поля `packageManager`.
4. Reviewer возвращает точное значение и evidence path.
5. Каждый уровень возвращает родителю route marker, `files changed: none` и результат.

Expected result: `pnpm@9.15.9`; никаких Edit/Write, Git mutation, network или external action.
