import type { Metadata } from 'next';
import { TrackedTicketView } from '@/features/giveaway/tracked-ticket-view';

/// Страница отслеживания билета по ссылке из «Скопировать ссылку для отслеживания».
/// Не индексируется; токен не попадает в referrer.
export const metadata: Metadata = {
  title: 'Билет розыгрыша',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default function GiveawayTicketRoute({ params }: { params: { token: string } }) {
  return <TrackedTicketView token={params.token} />;
}
