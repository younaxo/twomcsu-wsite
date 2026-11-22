import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PAGE_TITLES } from '@/lib/site/page-titles';

export const metadata: Metadata = { title: PAGE_TITLES['/achievements'] };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
