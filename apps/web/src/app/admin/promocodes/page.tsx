import { redirect } from 'next/navigation';

/// Короткий путь /admin/promocodes ведёт в раздел магазина (иначе 404).
export default function PromocodesRedirect() {
  redirect('/admin/store/promocodes');
}
