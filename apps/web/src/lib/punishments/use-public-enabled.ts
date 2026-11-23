'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useShellMode } from '@/lib/site/shell-mode';

/// Включён ли публичный список наказаний (Q74). Зонд `GET /punishments/public?limit=1`:
/// 404 `punishments_public_disabled` - раздел выключен; успех, 503, 429 и прочие ответы API -
/// раздел включён (данные могут быть временно недоступны). Пока идёт загрузка или
/// сеть недоступна - `false` (ссылка честно показывается как «скоро»).
/// В режиме сайта розыгрыша (внешний сайт) зонд не выполняется.
export async function probePublicEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    await api.get('/punishments/public', { auth: false, query: { limit: 1 }, signal });
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      return !(error.status === 404 && error.code === 'punishments_public_disabled');
    }
    throw error;
  }
}

export function usePublicPunishmentsEnabled(): boolean {
  const { mainSiteUrl } = useShellMode();
  const query = useQuery({
    queryKey: ['punishments', 'public', 'enabled'],
    queryFn: ({ signal }) => probePublicEnabled(signal),
    enabled: mainSiteUrl === null,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return query.data === true;
}
