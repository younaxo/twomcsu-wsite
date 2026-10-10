'use client';

import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { ConversationList } from '@/components/messages/conversation-list';

/// «Сообщения» (срез 2.4, ADR-0112): список бесед; беседа — `/messages/[id]`.
export default function MessagesPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 md:px-6">
      <PageHeader title="Сообщения" description="Личные беседы и группы." />
      <RequireSession>
        <div className="rounded-xl bg-surface p-4 shadow-sm">
          <ConversationList />
        </div>
      </RequireSession>
    </div>
  );
}
