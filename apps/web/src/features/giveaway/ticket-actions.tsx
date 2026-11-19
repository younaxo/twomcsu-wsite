'use client';

import { Download, Link2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { saveTicketPng, trackingUrl } from './ticket-image';

const buttonClass =
  'inline-flex h-control items-center justify-center gap-2 rounded border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4';

/// Действия с билетом: PNG на клиенте и ссылка отслеживания. Сообщения - toast сайта.
export function TicketActions({
  ticket,
  playerName,
  issuedAt,
  trackingToken,
}: {
  ticket: string;
  playerName: string;
  issuedAt: string | null;
  trackingToken: string | null;
}) {
  const save = async () => {
    try {
      const name = await saveTicketPng({ ticket, playerName, issuedAt });
      toast.success('Билет сохранён', { description: name });
    } catch {
      toast.error('Не удалось сохранить билет');
    }
  };
  const copyLink = async () => {
    if (!trackingToken) return;
    try {
      await navigator.clipboard.writeText(trackingUrl(window.location.origin, trackingToken));
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  };
  return (
    <div data-testid="ticket-actions" className="flex flex-wrap items-center justify-center gap-3">
      <button type="button" onClick={() => void save()} className={buttonClass}>
        <Download aria-hidden="true" />
        Сохранить билет
      </button>
      {trackingToken ? (
        <button type="button" onClick={() => void copyLink()} className={buttonClass}>
          <Link2 aria-hidden="true" />
          Скопировать ссылку для отслеживания
        </button>
      ) : null}
    </div>
  );
}
