'use client';

import { PERMISSIONS, type PermissionDto } from '@twomc/shared';
import { Search, Shield } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader, StatCard, StatGrid } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { usePermissionsCatalog } from '@/lib/admin/hooks';
import { permissionModuleLabel } from '@/lib/admin/permission-modules';
import { formatNumber } from '@/lib/format';

type CatalogEntry = Pick<PermissionDto, 'key' | 'module' | 'description'>;

function Catalog({ entries, fallback }: { entries: CatalogEntry[]; fallback: boolean }) {
  const [query, setQuery] = useState('');
  const modules = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const groups = new Map<string, CatalogEntry[]>();
    for (const entry of entries) {
      if (
        needle &&
        !entry.key.toLowerCase().includes(needle) &&
        !entry.description.toLowerCase().includes(needle)
      ) {
        continue;
      }
      const list = groups.get(entry.module) ?? [];
      list.push(entry);
      groups.set(entry.module, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries, query]);

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatCard label="Ключей" value={entries.length} />
        <StatCard label="Модулей" value={new Set(entries.map((e) => e.module)).size} />
      </StatGrid>
      {fallback ? (
        <p className="text-sm text-muted-foreground">
          Сервер вернул пустой реестр — показан реестр из пакета shared.
        </p>
      ) : null}
      <div className="w-full sm:w-80">
        <Input
          leading={<Search />}
          placeholder="Ключ или описание"
          aria-label="Поиск по permissions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {modules.length === 0 ? (
        <EmptyState size="sm" title="Ничего не найдено" />
      ) : (
        <Card flush>
          <Accordion type="multiple" defaultValue={query ? modules.map(([m]) => m) : []}>
            {modules.map(([module, items]) => (
              <AccordionItem key={module} value={module}>
                <AccordionTrigger>
                  <span className="flex flex-1 items-center gap-3">
                    {permissionModuleLabel(module)}
                    <span className="font-mono text-xs text-subtle-foreground">{module}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular">
                      {formatNumber(items.length)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.key}>
                          <TableCell className="w-72 font-mono text-xs">{item.key}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.description}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
    </div>
  );
}

export default function PermissionsPage() {
  const catalog = usePermissionsCatalog();
  return (
    <PermissionGate requirement="permissions.manage">
      <PageHeader
        title="Permissions"
        breadcrumbs={[{ label: 'Permissions' }]}
        description="Реестр ключей прав. Права выдаются ролям, роли — пользователям."
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/roles">
              <Shield />
              Открыть роли
            </Link>
          </Button>
        }
      />
      <QueryBoundary query={catalog} skeleton={<SkeletonRows rows={8} />}>
        {(data) =>
          data.length > 0 ? (
            <Catalog entries={data} fallback={false} />
          ) : (
            <Catalog entries={[...PERMISSIONS]} fallback />
          )
        }
      </QueryBoundary>
    </PermissionGate>
  );
}
