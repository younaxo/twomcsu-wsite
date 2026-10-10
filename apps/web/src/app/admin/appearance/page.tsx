'use client';

import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { SeasonalTab } from './_components/seasonal-tab';

/// «Оформление → Сезонное оформление» (ADR-0079): отдельный раздел — права
/// сезонов не требуют прав на общие настройки сайта.
export default function AppearancePage() {
  return (
    <PermissionGate requirement="settings.seasonal.view">
      <PageHeader
        title="Сезонное оформление"
        breadcrumbs={[{ label: 'Оформление' }, { label: 'Сезонное оформление' }]}
        description="Праздничная «o», декор шапки, эффекты и расписание кампаний. Основной логотип не меняется."
      />
      <SeasonalTab />
    </PermissionGate>
  );
}
