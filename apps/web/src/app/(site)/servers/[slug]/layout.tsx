import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fetchEntityTitle } from '@/lib/seo';

/// Title по данным записи (API); нет данных — «Сервер».
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  return { title: await fetchEntityTitle(`/servers/${encodeURIComponent(params.slug)}`, 'Сервер') };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
