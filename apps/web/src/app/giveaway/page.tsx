import type { Metadata } from 'next';
import { GiveawayApp } from '@/features/giveaway/giveaway-app';
import { isGiveawayOnly } from '@/features/giveaway/giveaway-only';
import { MAIN_SITE_URL } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Розыгрыш',
  description: 'Розыгрыш на «Анархии Новой Эры»: получите код и введите его в игре.',
};

/// GIVEAWAY_ONLY и MAIN_SITE_URL - серверные переменные окружения: страница
/// рендерится на каждый запрос, а не при сборке.
export const dynamic = 'force-dynamic';

/// Модуль giveaway. Страница не обращается к API сайта: только `/api/giveaway/*`
/// с клиента (мини-выкладка GIVEAWAY_ONLY). Шапка и футер - общий каркас основного
/// сайта; в GIVEAWAY_ONLY их ссылки ведут на основной сайт (MAIN_SITE_URL).
export default function GiveawayRoute() {
  return <GiveawayApp mainSiteUrl={isGiveawayOnly() ? MAIN_SITE_URL : null} />;
}
