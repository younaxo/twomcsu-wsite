'use client';

import { BadgeCheck } from 'lucide-react';
import { TeamCatalogPage } from '@/app/admin/_components/team-catalog';
import { CUSTOM_POSITIONS } from '@/lib/admin/team';

/// Свои должности в админке (срез 7.6, ADR-0140): особые подписи,
/// которые выдаются отдельным игрокам (одна на игрока).
export default function AdminCustomPositionsPage() {
  return (
    <TeamCatalogPage
      kind={CUSTOM_POSITIONS}
      emptyIcon={<BadgeCheck />}
      copy={{
        title: 'Свои должности',
        description: 'Особые подписи для отдельных игроков — одна на игрока.',
        emptyTitle: 'Своих должностей пока нет',
        addLabel: 'Добавить должность',
        createTitle: 'Новая своя должность',
        editTitle: 'Изменить свою должность',
        created: 'Должность создана',
        saved: 'Должность сохранена',
        deleted: 'Должность удалена',
        countLabel: 'У игроков',
        deleteTitle: (name) => `Удалить должность «${name}»?`,
        deleteDescription: (count) =>
          `Должность снимется со всех игроков (${count}). Действие необратимо.`,
      }}
    />
  );
}
