'use client';

import { Network } from 'lucide-react';
import { TeamCatalogPage } from '@/app/admin/_components/team-catalog';
import { DEPARTMENTS } from '@/lib/admin/team';

/// Отделы команды в админке (срез 7.6, ADR-0140).
export default function AdminDepartmentsPage() {
  return (
    <TeamCatalogPage
      kind={DEPARTMENTS}
      emptyIcon={<Network />}
      copy={{
        title: 'Отделы',
        description: 'Отделы команды проекта.',
        emptyTitle: 'Отделов пока нет',
        addLabel: 'Добавить отдел',
        createTitle: 'Новый отдел',
        editTitle: 'Изменить отдел',
        created: 'Отдел создан',
        saved: 'Отдел сохранён',
        deleted: 'Отдел удалён',
        countLabel: 'Участников',
        deleteTitle: (name) => `Удалить отдел «${name}»?`,
        deleteDescription: (count) =>
          `Отдел снимется со всех участников (${count}). Действие необратимо.`,
      }}
    />
  );
}
