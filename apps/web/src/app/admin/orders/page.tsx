import { redirect } from 'next/navigation';

/// Короткий путь /admin/orders ведёт в раздел магазина (иначе 404).
export default function OrdersRedirect() {
  redirect('/admin/store/orders');
}
