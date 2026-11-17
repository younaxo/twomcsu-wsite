import type { Metadata } from 'next';
import { PublicBansList } from '@/components/punishments/public-bans';

/// Публичный банлист: не индексируется (контракт 2.3, Q57/О5).
export const metadata: Metadata = {
  title: 'Список наказаний',
  robots: { index: false, follow: false },
};

export default function BansPage() {
  return <PublicBansList />;
}
