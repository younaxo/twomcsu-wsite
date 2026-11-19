import type { Metadata } from 'next';
import { AdminApp } from '@/features/giveaway/admin-app';
import { isGiveawayOnly } from '@/features/giveaway/giveaway-only';
import { MAIN_SITE_URL } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Панель розыгрыша',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/// Админка розыгрыша. На сайте её открывает только хост админки (см. middleware);
/// авторизация - Discord OAuth на бэкенде, страница ходит лишь на `/api/giveaway/v1/admin/*`.
export default function GiveawayAdminRoute() {
  return <AdminApp mainSiteUrl={isGiveawayOnly() ? MAIN_SITE_URL : null} />;
}
