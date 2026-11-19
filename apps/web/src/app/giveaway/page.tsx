import type { Metadata } from 'next';
import { GiveawayApp } from '@/features/giveaway/giveaway-app';

export const metadata: Metadata = {
  title: 'Розыгрыш',
  description: 'Розыгрыш на «Анархии Новой Эры»: получите код и введите его в игре.',
};

/// Модуль giveaway. Страница не обращается к API сайта: только `/api/giveaway/*`
/// с клиента (мини-выкладка GIVEAWAY_ONLY).
export default function GiveawayRoute() {
  return <GiveawayApp />;
}
