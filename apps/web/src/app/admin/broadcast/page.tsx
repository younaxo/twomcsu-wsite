import { redirect } from 'next/navigation';

/// Раздел переехал: «Коммуникации → Объявления» (ADR-0081). Старые ссылки и
/// закладки ведут туда же.
export default function BroadcastRedirect() {
  redirect('/admin/announcements');
}
