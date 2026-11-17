-- Q50, ADR-0174: перенос прав заметок обращений на новые ключи (продолжение ADR-0172).
-- Раньше правка чужих заметок шла по reports.delete, открепление по reports.notes.pin;
-- теперь это reports.notes.edit и reports.notes.unpin. Миграция только добавляет
-- строки и выдаёт новые права ролям, у которых есть соответствующее старое право
-- с effect ALLOW. Запись DENY не копируется. Ничего не удаляется и не меняется.
-- Повторный запуск безопасен (ON CONFLICT DO NOTHING).

-- 1. Каталог прав. id детерминированный (по образцу 'migrated-...' из
-- 20261009150000_site_alert_social_links): cuid() генерирует клиент Prisma,
-- в SQL его нет. Если seed уже создал право, срабатывает конфликт по key (или id)
-- и строка не трогается; seed позже синхронизирует по key и id не меняет.
INSERT INTO "permissions" ("id", "key", "module", "description", "createdAt")
VALUES
  ('migrated-reports.notes.edit', 'reports.notes.edit', 'reports',
   'Правка чужих заметок модератора (автор всегда правит свои)', CURRENT_TIMESTAMP),
  ('migrated-reports.notes.unpin', 'reports.notes.unpin', 'reports',
   'Открепление заметки модератора', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- 2. Выдача: reports.delete -> reports.notes.edit.
INSERT INTO "role_permissions" ("roleId", "permissionId", "effect", "createdAt")
SELECT old_rp."roleId", new_p."id", 'ALLOW', CURRENT_TIMESTAMP
FROM "role_permissions" old_rp
JOIN "permissions" old_p ON old_p."id" = old_rp."permissionId" AND old_p."key" = 'reports.delete'
JOIN "permissions" new_p ON new_p."key" = 'reports.notes.edit'
WHERE old_rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;

-- 3. Выдача: reports.notes.pin -> reports.notes.unpin.
INSERT INTO "role_permissions" ("roleId", "permissionId", "effect", "createdAt")
SELECT old_rp."roleId", new_p."id", 'ALLOW', CURRENT_TIMESTAMP
FROM "role_permissions" old_rp
JOIN "permissions" old_p ON old_p."id" = old_rp."permissionId" AND old_p."key" = 'reports.notes.pin'
JOIN "permissions" new_p ON new_p."key" = 'reports.notes.unpin'
WHERE old_rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
