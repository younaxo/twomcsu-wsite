'use client';

import type {
  AnnouncementKind,
  AnnouncementPlacement,
  AnnouncementStatus,
  PublicAnnouncementDto,
} from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';

/// Объявления (ADR-0081): семантика типов — один источник для сайта и админки.
export const ANNOUNCEMENT_KIND_META: Record<
  AnnouncementKind,
  { label: string; tone: 'info' | 'destructive' | 'warning' | 'success' | 'primary' }
> = {
  info: { label: 'Информация', tone: 'info' },
  important: { label: 'Важно', tone: 'destructive' },
  warning: { label: 'Предупреждение', tone: 'warning' },
  update: { label: 'Обновление', tone: 'success' },
  event: { label: 'Событие', tone: 'primary' },
  maintenance: { label: 'Технические работы', tone: 'warning' },
};

export const ANNOUNCEMENT_PLACEMENT_LABELS: Record<AnnouncementPlacement, string> = {
  banner: 'На сайте (под шапкой)',
  notifications: 'В центре уведомлений',
  dashboard: 'На главной админки',
};

export const ANNOUNCEMENT_STATUS_META: Record<
  AnnouncementStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }
> = {
  draft: { label: 'Черновик', tone: 'neutral' },
  scheduled: { label: 'Запланировано', tone: 'info' },
  active: { label: 'Показывается', tone: 'success' },
  expired: { label: 'Срок истёк', tone: 'neutral' },
  unpublished: { label: 'Снято', tone: 'warning' },
};

/// Активные объявления места для текущего зрителя (гость или вошедший).
export function usePublicAnnouncements(placement: 'banner' | 'dashboard') {
  const status = useAuthStore((state) => state.status);
  return useQuery({
    queryKey: ['site', 'announcements', placement, status],
    queryFn: () =>
      api.get<PublicAnnouncementDto[]>('/site/announcements', {
        query: { placement },
        auth: status === 'authenticated',
      }),
    enabled: status !== 'loading' && status !== 'idle',
    staleTime: 60_000,
  });
}

const DISMISSED_KEY = 'twomc:dismissed-announcements';

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/// Скрытые пользователем объявления — удобство этого браузера (не состояние
/// сервера); недоступное хранилище — просто ничего не помним.
export function useDismissedAnnouncements() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);
  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...new Set([...prev, id])].slice(-50);
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // хранилище недоступно — скрываем только до перезагрузки
      }
      return next;
    });
  }, []);
  return { dismissed, dismiss };
}
