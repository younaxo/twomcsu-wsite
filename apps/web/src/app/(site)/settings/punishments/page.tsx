'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

interface PunishmentDto {
  id: string;
  punishmentType: 'WARN' | 'MUTE' | 'KICK' | 'TEMPBAN' | 'PERMBAN';
  reason: string;
  duration: string | null;
  server: string | null;
  issuedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

const TYPE_LABELS: Record<PunishmentDto['punishmentType'], string> = {
  WARN: 'Предупреждение',
  MUTE: 'Мут',
  KICK: 'Кик',
  TEMPBAN: 'Временный бан',
  PERMBAN: 'Бан навсегда',
};

/// Действует ли наказание сейчас: активно и не истекло по времени.
function inEffect(item: PunishmentDto): boolean {
  return item.isActive && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now());
}

/// «Настройки → Наказания» (волна 1, срез 1.5): история наказаний игрока.
export default function PunishmentsPage() {
  const query = useQuery({
    queryKey: ['account', 'punishments'],
    queryFn: () => api.get<PunishmentDto[]>('/users/me/punishments'),
  });
  return (
    <>
      <PageHeader
        title="Наказания"
        description="Предупреждения, муты и баны на серверах и сайте twomc.su."
      />
      <RequireSession>
        <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} />}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck />}
                title="Наказаний нет"
                description="Так держать — история чистая."
              />
            ) : (
              <ul className="flex flex-col gap-3" data-testid="punishments">
                {items.map((item) => {
                  const active = inEffect(item);
                  return (
                    <li
                      key={item.id}
                      data-active={active}
                      className="flex flex-col gap-1 rounded-xl bg-surface p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {TYPE_LABELS[item.punishmentType]}
                        </span>
                        <Badge tone={active ? 'warning' : 'neutral'}>
                          {active ? 'Действует' : 'Не действует'}
                        </Badge>
                        {item.server ? (
                          <span className="text-xs text-subtle-foreground">{item.server}</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.reason}</p>
                      <p className="text-xs text-subtle-foreground">
                        Выдано {formatDateTime(item.issuedAt)}
                        {item.expiresAt
                          ? ` · до ${formatDateTime(item.expiresAt)}`
                          : item.punishmentType === 'PERMBAN'
                            ? ' · бессрочно'
                            : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryBoundary>
      </RequireSession>
    </>
  );
}
