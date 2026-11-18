'use client';

import { useState } from 'react';
import { OrdersList } from '@/components/store/orders-list';
import { ModuleGate } from '@/components/system/site-availability';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ORDERS_PAGE_SIZE } from '@/lib/store/checkout';

function OrdersContent() {
  const [page, setPage] = useState(1);
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Мои заказы' }]} />
      <h1 className="font-display text-2xl font-bold md:text-3xl">Мои заказы</h1>
      <div className="max-w-3xl">
        <OrdersList page={page} limit={ORDERS_PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}

/// «Мои заказы»: список своих заказов со статусом оплаты. Модуль «store»
/// выключен — ModuleGate (пункт меню профиля скрыт тем же признаком).
export default function OrdersPage() {
  return (
    <ModuleGate module="store">
      <OrdersContent />
    </ModuleGate>
  );
}
