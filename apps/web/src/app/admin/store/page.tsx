import { redirect } from 'next/navigation';

/// Короткий путь /admin/store ведёт в раздел магазина (иначе 404).
export default function StoreRedirect() {
  redirect('/admin/store/products');
}
