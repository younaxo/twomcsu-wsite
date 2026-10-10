'use client';

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import { useStartConversation } from '@/lib/messages/hooks';

/// «Написать» на профиле (срез 2.4): открывает личную беседу (повторно — ту же).
/// Политику ЛС и блокировки проверяет сервер — его ответ показывается текстом.
export function WriteButton({ username }: { username: string }) {
  const router = useRouter();
  const { direct } = useStartConversation();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={direct.isPending}
      onClick={() =>
        direct.mutate(username, {
          onSuccess: (conversation) => router.push(`/messages/${conversation.id}`),
          onError: (error) => toast.error(getErrorMessage(error)),
        })
      }
    >
      <MessageSquare />
      Написать
    </Button>
  );
}
