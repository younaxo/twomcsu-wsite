'use client';

import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { OrdersList } from '@/components/store/orders-list';
import { ModuleGate } from '@/components/system/site-availability';

/// «Настройки → История покупок»: последние заказы со статусом оплаты;
/// полный список с пагинацией — на `/shop/orders`.
export default function PurchasesSettingsPage() {
  return (
    <ModuleGate module="store">
      <PageHeader
        title="История покупок"
        description="Ваши последние заказы и статус их оплаты. Статус выдачи появится позже."
      />
      <RequireSession>
        <section aria-label="История покупок">
          <OrdersList limit={5} />
        </section>
      </RequireSession>
    </ModuleGate>
  );
}
