'use client';

import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/lib/auth/use-permissions';
import { BulkMessage } from './_components/bulk-message';
import { PersonalMessage } from './_components/personal-message';

/// «Коммуникации → Сообщения» (ADR-0080): системные сообщения от имени
/// twomc.su — личные и массовые (отдельное право, предпросмотр, подтверждение).
export default function CommunicationsPage() {
  const { can } = usePermissions();
  const tabs = [
    can('communications.messages.send') && {
      value: 'personal',
      label: 'Личное сообщение',
      content: <PersonalMessage />,
    },
    can('communications.messages.bulk') && {
      value: 'bulk',
      label: 'Массовая рассылка',
      content: <BulkMessage />,
    },
  ].filter((tab): tab is { value: string; label: string; content: JSX.Element } => Boolean(tab));

  return (
    <PermissionGate requirement={['communications.messages.send', 'communications.messages.bulk']}>
      <PageHeader
        title="Сообщения"
        breadcrumbs={[{ label: 'Коммуникации' }, { label: 'Сообщения' }]}
        description="Системные сообщения от имени twomc.su приходят в центр уведомлений получателя."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Виды сообщений">
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
