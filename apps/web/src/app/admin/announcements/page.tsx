'use client';

import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/lib/auth/use-permissions';
import { AnnouncementsPanel } from './_components/announcements-panel';
import { GlobalAlertEditor } from './_components/global-alert-editor';

/// «Коммуникации → Объявления» (ADR-0081): объявления с типами, расписанием,
/// аудиторией и местами показа; верхняя плашка сайта (ADR-0066).
export default function AnnouncementsPage() {
  const { can } = usePermissions();
  const tabs = [
    can('announcements.view') && {
      value: 'announcements',
      label: 'Объявления',
      content: <AnnouncementsPanel />,
    },
    can('settings.alert.view') && {
      value: 'alert',
      label: 'Верхняя плашка',
      content: <GlobalAlertEditor />,
    },
  ].filter((tab): tab is { value: string; label: string; content: JSX.Element } => Boolean(tab));

  return (
    <PermissionGate requirement={['announcements.view', 'settings.alert.view']}>
      <PageHeader
        title="Объявления"
        breadcrumbs={[{ label: 'Коммуникации' }, { label: 'Объявления' }]}
        description="Объявления на сайте, в центре уведомлений и на главной админки; плашка под шапкой."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Разделы объявлений">
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
