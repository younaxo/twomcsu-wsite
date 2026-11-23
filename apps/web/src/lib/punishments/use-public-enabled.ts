'use client';

import { usePublicSiteSettings } from '@/lib/site/hooks';

/// Включён ли публичный список наказаний (Q74): флаг `punishmentsPublicEnabled` из публичных
/// настроек сайта (`GET /site/settings`, общий кэш; отдельный зонд не нужен). Пока идёт загрузка,
/// при ошибке, у старого API без флага и в режиме сайта розыгрыша - `false` (ссылка «скоро»).
export function usePublicPunishmentsEnabled(): boolean {
  const { data } = usePublicSiteSettings();
  return data?.punishmentsPublicEnabled === true;
}
