'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/lib/auth/use-permissions';
import { MaintenancePanel } from './_components/maintenance-panel';
import { ModulesPanel } from './_components/modules-panel';

/// «Система → Техработы и модули» (ADR-0082).
export default function SystemPage() {
  const { can } = usePermissions();
  const tabs = [
    can('system.maintenance.view') && {
      value: 'maintenance',
      label: 'Технические работы',
      content: <MaintenancePanel />,
    },
    can('system.modules.view') && {
      value: 'modules',
      label: 'Модули сайта',
      content: <ModulesPanel />,
    },
  ].filter((tab): tab is { value: string; label: string; content: JSX.Element } => Boolean(tab));
  const [tab, setTab] = useState<string | undefined>(undefined);
  // `?tab=maintenance|modules` — быстрые действия дашборда ведут на нужную вкладку.
  const values = tabs.map((item) => item.value).join(',');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && values.split(',').includes(requested)) setTab(requested);
  }, [values]);

  return (
    <PermissionGate requirement={['system.maintenance.view', 'system.modules.view']}>
      <PageHeader
        title="Техработы и модули"
        breadcrumbs={[{ label: 'Система' }, { label: 'Техработы и модули' }]}
        description="Закрыть сайт или его части на технические работы, включить и выключить модули."
      />
      <Tabs value={tab ?? tabs[0]?.value} onValueChange={setTab} variant="line">
        <TabsList aria-label="Разделы системы">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </PermissionGate>
  );
}
