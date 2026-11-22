'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { formatPageTitle, titleForPath } from '@/lib/site/page-titles';

/// Ставит title вкладки «{title} — twomc.su» из клиентской страницы (данные
/// загружаются в браузере: админка, личные разделы, динамические записи).
/// Бейдж unread и суффикс админки добавляет DocumentBadge (MutationObserver).
export function PageTitle({ title }: { title: string | null | undefined }) {
  useEffect(() => {
    const value = title?.trim();
    if (value) document.title = formatPageTitle(value);
  }, [title]);
  return null;
}

/// Title по маршруту для статичных страниц (PAGE_TITLES); динамические
/// маршруты получают title из generateMetadata или PageTitle.
export function RouteTitle() {
  const pathname = usePathname();
  return <PageTitle title={titleForPath(pathname)} />;
}
