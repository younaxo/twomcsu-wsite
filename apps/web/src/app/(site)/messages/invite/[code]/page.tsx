'use client';

import { Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { RequireSession } from '@/components/auth/require-session';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useInvite, useJoinInvite } from '@/lib/messages/hooks';

/// Приглашение в группу по ссылке: название и «Вступить».
function InviteContent({ code }: { code: string }) {
  const router = useRouter();
  const invite = useInvite(code);
  const join = useJoinInvite(code);
  if (invite.isPending) return <SkeletonRows rows={2} />;
  if (invite.isError) {
    return (
      <EmptyState
        icon={<Users />}
        title="Приглашение недействительно"
        description={
          invite.error instanceof ApiError && invite.error.status === 404
            ? 'Ссылку отозвали или она неверная.'
            : getErrorMessage(invite.error)
        }
      />
    );
  }
  const title = invite.data.conversation?.title ?? 'Группа';
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-testid="group-invite">
      <Users aria-hidden className="size-10 text-muted-foreground" />
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">Вас пригласили в групповую беседу.</p>
      </div>
      <Button
        loading={join.isPending}
        onClick={() =>
          join.mutate(undefined, {
            onSuccess: (conversation) => router.replace(`/messages/${conversation.id}`),
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      >
        Вступить
      </Button>
    </div>
  );
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-3 py-10">
      <RequireSession>
        <div className="rounded-xl bg-surface p-6 shadow-sm">
          <InviteContent code={code} />
        </div>
      </RequireSession>
    </div>
  );
}
