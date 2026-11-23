import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fetchEntityTitle } from '@/lib/seo';

/// Title по данным записи (API); нет данных — «Правила».
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  return { title: await fetchEntityTitle(`/topics/${encodeURIComponent(params.slug)}`, 'Правила') };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
