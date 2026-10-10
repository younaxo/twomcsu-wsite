'use client';

import { useParams } from 'next/navigation';
import { RequireSession } from '@/components/auth/require-session';
import { ConversationList } from '@/components/messages/conversation-list';
import { ConversationView } from '@/components/messages/conversation-view';

/// Беседа: на широком экране слева список бесед, справа окно; на телефоне —
/// только окно (назад — к списку).
export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-6 md:px-6">
      <RequireSession>
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="hidden rounded-xl bg-surface p-4 shadow-sm lg:block">
            <ConversationList activeId={id} />
          </div>
          <ConversationView key={id} conversationId={id} />
        </div>
      </RequireSession>
    </div>
  );
}
