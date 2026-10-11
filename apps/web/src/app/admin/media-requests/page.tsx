'use client';

import { Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  MEDIA_GROUP_LABEL,
  safeChannelUrl,
  useAdminMediaRequests,
  useReviewMediaRequest,
  type AdminMediaRequest,
} from '@/lib/admin/media-requests';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Медиа-заявки в админке (срез 7.6, ADR-0141): очередь ожидающих заявок
/// на медиа-значок. Одобрение выдаёт значок, отказ — с необязательной
/// причиной, которую видит игрок. Решения — по праву `media_requests.edit`.

function RejectDialog({
  request,
  onOpenChange,
}: {
  request: AdminMediaRequest;
  onOpenChange: (open: boolean) => void;
}) {
  const review = useReviewMediaRequest();
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отклонить заявку</DialogTitle>
          <DialogDescription>
            {MEDIA_GROUP_LABEL[request.mediaGroup]} · {request.user.tag}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Причина" hint="Необязательно — игрок увидит её в настройках">
            <Textarea
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            loading={review.isPending}
            onClick={() =>
              review.mutate(
                { id: request.id, status: 'REJECTED', reviewNote: note.trim() || undefined },
                {
                  onSuccess: () => {
                    toast.success('Заявка отклонена');
                    onOpenChange(false);
                  },
                  onError: (error) => toast.error(getErrorMessage(error)),
                },
              )
            }
          >
            Отклонить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Queue() {
  const { can } = usePermissions();
  const requests = useAdminMediaRequests();
  const review = useReviewMediaRequest();
  const [approving, setApproving] = useState<AdminMediaRequest | null>(null);
  const [rejecting, setRejecting] = useState<AdminMediaRequest | null>(null);
  const canReview = can('media_requests.edit');

  if (requests.isPending) return <SkeletonRows rows={4} />;
  if (requests.isError) {
    return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />;
  }
  if (requests.data.length === 0) {
    return (
      <EmptyState
        icon={<Clapperboard />}
        title="Заявок нет"
        description="Новые заявки на медиа-значок появятся здесь."
      />
    );
  }
  return (
    <>
      <ul
        className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
        data-testid="media-requests"
      >
        {requests.data.map((request) => {
          const url = safeChannelUrl(request.channelUrl);
          return (
            <li key={request.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone="neutral">{MEDIA_GROUP_LABEL[request.mediaGroup]}</Badge>
                  <Link
                    href={`/admin/users/${encodeURIComponent(request.user.id)}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {request.user.tag}
                  </Link>
                  <span className="text-xs text-subtle-foreground">
                    {formatDateTime(request.createdAt)}
                  </span>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-xs text-primary hover:underline"
                  >
                    {request.channelUrl}
                  </a>
                ) : (
                  <span className="break-all text-xs text-muted-foreground">
                    {request.channelUrl}
                  </span>
                )}
                {request.description ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {request.description}
                  </p>
                ) : null}
              </div>
              {canReview ? (
                <span className="flex gap-1">
                  <Button size="sm" onClick={() => setApproving(request)}>
                    Одобрить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(request)}>
                    Отклонить
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title="Одобрить заявку?"
        description={
          approving
            ? `${approving.user.tag} получит значок ${MEDIA_GROUP_LABEL[approving.mediaGroup]}.`
            : undefined
        }
        confirmLabel="Одобрить"
        loading={review.isPending}
        onConfirm={() =>
          review.mutate(
            { id: approving!.id, status: 'APPROVED' },
            {
              onSuccess: () => {
                toast.success('Заявка одобрена, значок выдан');
                setApproving(null);
              },
              onError: (error) => {
                toast.error(getErrorMessage(error));
                setApproving(null);
              },
            },
          )
        }
      />
      {rejecting ? (
        <RejectDialog request={rejecting} onOpenChange={(open) => !open && setRejecting(null)} />
      ) : null}
    </>
  );
}

export default function AdminMediaRequestsPage() {
  return (
    <PermissionGate requirement="media_requests.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Медиа-заявки"
          description="Заявки авторов на значок YouTube, Twitch или TikTok."
        />
        <Queue />
      </div>
    </PermissionGate>
  );
}
