'use client';

import type { AdminUserFull } from '@twomc/shared';
import { BarChart3, PackageOpen } from 'lucide-react';
import { PageSection } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { InventoryView } from '@/components/inventory/inventory-view';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  PLAYER_INVENTORY_PERMISSION,
  formatPlayTime,
  useAdminPlayerInventory,
  useAdminPlayerStats,
} from '@/lib/inventory/admin-inventory';

/// Вкладка «Инвентарь и статистика» карточки пользователя (Q116): только
/// чтение, по праву `players.inventory.view`; каждый просмотр пишется в аудит.
/// Без права вкладка не рендерится вовсе (запросы не отправляются).
export const INVENTORY_TAB_REQUIREMENT = PLAYER_INVENTORY_PERMISSION;

export const NO_PLAYER_SNAPSHOT_TEXT =
  'Нет снимка — игрок ещё не заходил на сервер с плагином.';

function StatsBlock({ userId }: { userId: string }) {
  const query = useAdminPlayerStats(userId, true);
  return (
    <PageSection title="Статистика">
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={2} />} size="sm">
        {(data) =>
          data.state === 'no_data' || !data.stats ? (
            <p className="text-sm text-muted-foreground" data-testid="player-stats-empty">
              Статистики пока нет.
            </p>
          ) : (
            <dl
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              data-testid="player-stats"
            >
              {[
                ['Время в игре', formatPlayTime(data.stats.playTimeMinutes)],
                ['Убийства', formatNumber(data.stats.kills)],
                ['Смерти', formatNumber(data.stats.deaths)],
                ['Удары', formatNumber(data.stats.hits)],
                ['K/D', data.stats.killDeathRatio.toFixed(2)],
                ['Последний сервер', data.stats.lastServer ?? '—'],
                ['Обновлено', formatDateTime(data.stats.updatedAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-lg bg-surface-sunken p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )
        }
      </QueryBoundary>
    </PageSection>
  );
}

function InventoryBlock({ userId }: { userId: string }) {
  const query = useAdminPlayerInventory(userId, true);
  return (
    <PageSection title="Инвентарь">
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />} size="sm">
        {(data) =>
          data.state === 'no_data' || data.servers.length === 0 ? (
            <Card>
              <EmptyState
                icon={<PackageOpen />}
                title="Инвентаря нет"
                description={NO_PLAYER_SNAPSHOT_TEXT}
                data-testid="player-inventory-empty"
              />
            </Card>
          ) : (
            <InventoryView servers={data.servers} />
          )
        }
      </QueryBoundary>
    </PageSection>
  );
}

export function InventoryTab({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  if (!can(INVENTORY_TAB_REQUIREMENT)) return null;
  return (
    <div className="flex flex-col gap-5" aria-live="polite" data-testid="player-inventory-tab">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BarChart3 aria-hidden className="size-4" />
        Только просмотр. Обращение к инвентарю и статистике игрока {user.username} записывается в
        журнал аудита.
      </p>
      <StatsBlock userId={user.id} />
      <InventoryBlock userId={user.id} />
    </div>
  );
}
