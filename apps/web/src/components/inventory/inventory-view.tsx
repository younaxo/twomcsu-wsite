'use client';

import type {
  InventoryGroupViewDto,
  InventoryItemDto,
  InventoryServerViewDto,
} from '@twomc/shared';
import { Clock, PackageOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatDateTime } from '@/lib/format';
import { AREA_SIZE, groupSlots } from '@/lib/inventory/inventory';
import { ItemDetails } from './item-details';
import { SlotGrid } from './slot-grid';

export const NO_SNAPSHOT_TEXT = 'Данных пока нет — сервер не прислал снимок.';

interface Selection {
  key: string;
  item: InventoryItemDto | null;
}

function GroupStatus({ group }: { group: InventoryGroupViewDto }) {
  if (group.state === 'no_data' || !group.capturedAt) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Clock aria-hidden className="size-3.5" />
      <span>Снимок от {formatDateTime(group.capturedAt)}</span>
      {group.playerOnline ? <Badge tone="neutral">В игре</Badge> : null}
      {!group.isFresh ? <Badge tone="warning">Мог устареть</Badge> : null}
    </p>
  );
}

function MainGroup({
  group,
  selection,
  onSelect,
}: {
  group: InventoryGroupViewDto;
  selection: Selection | null;
  onSelect: (key: string, item: InventoryItemDto | undefined) => void;
}) {
  const items = useMemo(() => groupSlots(group), [group]);
  const selected = selection?.key ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Основной инвентарь</h4>
          <SlotGrid
            area="main"
            size={AREA_SIZE.main}
            items={items}
            label="Основной инвентарь"
            selected={selected}
            onSelect={onSelect}
          />
        </div>
        <div className="flex flex-row gap-4 sm:flex-col">
          <div className="flex w-14 flex-col gap-2">
            <h4 className="text-sm font-medium">Броня</h4>
            <SlotGrid
              area="armor"
              size={AREA_SIZE.armor}
              columns={1}
              items={items}
              label="Броня"
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          <div className="flex w-14 flex-col gap-2">
            <h4 className="text-sm font-medium">Вторая рука</h4>
            <SlotGrid
              area="offhand"
              size={AREA_SIZE.offhand}
              columns={1}
              items={items}
              label="Вторая рука"
              selected={selected}
              onSelect={onSelect}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">Панель быстрого доступа</h4>
        <SlotGrid
          area="hotbar"
          size={AREA_SIZE.hotbar}
          items={items}
          label="Панель быстрого доступа"
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function EnderGroup({
  group,
  selection,
  onSelect,
}: {
  group: InventoryGroupViewDto;
  selection: Selection | null;
  onSelect: (key: string, item: InventoryItemDto | undefined) => void;
}) {
  const items = useMemo(() => groupSlots(group), [group]);
  return (
    <SlotGrid
      area="ender"
      size={AREA_SIZE.ender}
      items={items}
      label="Эндер-сундук"
      selected={selection?.key ?? null}
      onSelect={onSelect}
    />
  );
}

/// Снимок одного сервера: части «Инвентарь» и «Эндер-сундук». Часть без
/// снимка (`no_data`) честно сообщает, что данных нет.
function ServerSnapshot({ server }: { server: InventoryServerViewDto }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelect = (key: string, item: InventoryItemDto | undefined) =>
    setSelection({ key, item: item ?? null });
  const groups = [
    { group: server.groups.find((g) => g.group === 'main'), title: 'Инвентарь' },
    { group: server.groups.find((g) => g.group === 'ender'), title: 'Эндер-сундук' },
  ];
  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ group, title }) => (
        <section
          key={title}
          aria-label={title}
          className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
        >
          <h3 className="text-lg font-semibold">{title}</h3>
          {!group || group.state === 'no_data' ? (
            <p className="text-sm text-muted-foreground" data-testid="group-no-data">
              {NO_SNAPSHOT_TEXT}
            </p>
          ) : (
            <>
              <GroupStatus group={group} />
              {group.group === 'main' ? (
                <MainGroup group={group} selection={selection} onSelect={onSelect} />
              ) : (
                <EnderGroup group={group} selection={selection} onSelect={onSelect} />
              )}
            </>
          )}
        </section>
      ))}
      <Card variant="sunken" aria-live="polite" aria-label="Выбранный предмет">
        <ItemDetails item={selection?.item ?? null} />
      </Card>
    </div>
  );
}

export function InventoryView({ servers }: { servers: InventoryServerViewDto[] }) {
  const [slug, setSlug] = useState<string | null>(null);
  if (servers.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<PackageOpen />}
          title="Инвентаря пока нет"
          description={NO_SNAPSHOT_TEXT}
          data-testid="inventory-empty"
        />
      </Card>
    );
  }
  const current = servers.find((server) => server.server.slug === slug) ?? servers[0];
  return (
    <div className="flex flex-col gap-4">
      {servers.length > 1 ? (
        <SegmentedControl
          aria-label="Сервер"
          value={current.server.slug}
          onValueChange={setSlug}
          options={servers.map((server) => ({
            value: server.server.slug,
            label: server.server.name,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Сервер: {current.server.name}</p>
      )}
      <ServerSnapshot key={current.server.slug} server={current} />
    </div>
  );
}
