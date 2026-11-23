'use client';

import { Lock, PackageOpen, Hourglass } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import { DecorationsSection } from '@/components/inventory/decorations-section';
import { InventoryView } from '@/components/inventory/inventory-view';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  isInventoryUnavailable,
  useMyInventory,
  useMyInventoryPrivacy,
} from '@/lib/inventory/inventory';

/// Приватность по умолчанию (Q39, 152-ФЗ): публичного просмотра в этом срезе
/// нет, переключатели не показываем — только статус.
function PrivacyNote({ enabled }: { enabled: boolean }) {
  const privacy = useMyInventoryPrivacy(enabled);
  const isPublic = privacy.data?.inventoryPublic === true;
  return (
    <p
      className="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="inventory-privacy-note"
    >
      <Lock aria-hidden className="size-4" />
      {isPublic
        ? 'Публичный просмотр инвентаря пока не включён: другие игроки его не видят.'
        : 'Инвентарь виден только вам.'}
    </p>
  );
}

function InventoryContent() {
  const query = useMyInventory();
  if (isInventoryUnavailable(query.error)) {
    return (
      <Card>
        <EmptyState
          icon={<Hourglass />}
          title="Инвентарь скоро появится"
          description="Раздел пока выключен. Он заработает, когда игровые сервера начнут присылать снимки."
          data-testid="inventory-disabled"
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <PrivacyNote enabled={query.isSuccess} />
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
        {(data) => <InventoryView servers={data.servers} />}
      </QueryBoundary>
    </div>
  );
}

/// «Настройки → Мой инвентарь»: снимок Minecraft-инвентаря и украшения сайта.
export default function InventorySettingsPage() {
  return (
    <>
      <PageHeader
        title="Мой инвентарь"
        description="Снимок вашего инвентаря в игре и украшения сайта. Виден только вам."
        meta={<PackageOpen aria-hidden className="size-5 text-muted-foreground" />}
      />
      <RequireSession>
        <div className="flex flex-col gap-5">
          <InventoryContent />
          <DecorationsSection />
        </div>
      </RequireSession>
    </>
  );
}
