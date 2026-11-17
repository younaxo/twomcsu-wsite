import type { Metadata } from 'next';
import { PublicBanCard } from '@/components/punishments/public-bans';

/// Карточка наказания: `robots: noindex` обязателен (контракт 2.3).
export const metadata: Metadata = {
  title: 'Наказание',
  robots: { index: false, follow: false },
};

export default function BanCardPage({ params }: { params: { ref: string } }) {
  return <PublicBanCard reference={params.ref} />;
}
