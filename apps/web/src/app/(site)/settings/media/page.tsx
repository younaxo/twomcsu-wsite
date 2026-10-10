'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';

type MediaGroup = 'YOUTUBE' | 'TWITCH' | 'TIKTOK';
interface MediaRequestDto {
  id: string;
  mediaGroup: MediaGroup;
  channelUrl: string;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  createdAt: string;
}

const KEY = ['account', 'media-requests'] as const;
const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';
const GROUPS: { value: MediaGroup; label: string }[] = [
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'TWITCH', label: 'Twitch' },
  { value: 'TIKTOK', label: 'TikTok' },
];
const STATUS = {
  PENDING: { label: 'На рассмотрении', tone: 'info' },
  APPROVED: { label: 'Одобрена', tone: 'success' },
  REJECTED: { label: 'Отклонена', tone: 'neutral' },
} as const;

/// «Настройки → Медиа» (волна 1, срез 1.6): заявка на медиа-бейдж создателя
/// контента и история заявок. Решение принимает модерация.
export default function MediaRequestPage() {
  const client = useQueryClient();
  const [group, setGroup] = useState<MediaGroup>('YOUTUBE');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<MediaRequestDto[]>('/users/me/media-requests'),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post('/users/me/media-request', {
        mediaGroup: group,
        channelUrl: url.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: KEY }),
  });
  const pending = (query.data ?? []).some((item) => item.status === 'PENDING');

  const submit = async () => {
    try {
      await create.mutateAsync();
      toast.success('Заявка отправлена');
      setUrl('');
      setDescription('');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Медиа-бейдж"
        description="Для создателей контента о twomc.su: бейдж в профиле после проверки модерацией."
      />
      <RequireSession>
        <div className="flex flex-col gap-5">
          <section className={island} aria-label="Новая заявка">
            <h3 className="text-sm font-semibold">Новая заявка</h3>
            <Field label="Площадка">
              <SegmentedControl
                aria-label="Площадка"
                value={group}
                onValueChange={(value) => setGroup(value as MediaGroup)}
                options={GROUPS}
              />
            </Field>
            <Field label="Ссылка на канал" required>
              <Input
                value={url}
                maxLength={300}
                placeholder="https://youtube.com/@канал"
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            <Field label="Расскажите о канале" hint="Необязательно, до 1000 символов">
              <Textarea
                rows={3}
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div>
              <Button onClick={submit} loading={create.isPending} disabled={!url.trim() || pending}>
                Отправить заявку
              </Button>
              {pending ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Предыдущая заявка ещё на рассмотрении.
                </p>
              ) : null}
            </div>
          </section>

          <section className={island} aria-label="Мои заявки">
            <h3 className="text-sm font-semibold">Мои заявки</h3>
            <QueryBoundary query={query} skeleton={<SkeletonRows rows={2} />}>
              {(items) =>
                items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Заявок пока не было.</p>
                ) : (
                  <ul
                    className="flex flex-col divide-y divide-border-subtle"
                    data-testid="media-requests"
                  >
                    {items.map((item) => (
                      <li key={item.id} className="flex flex-col gap-1 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {GROUPS.find((g) => g.value === item.mediaGroup)?.label}
                          </span>
                          <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                          <span className="text-xs text-subtle-foreground">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">{item.channelUrl}</p>
                        {item.reviewNote ? (
                          <p className="text-xs">Комментарий модерации: {item.reviewNote}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              }
            </QueryBoundary>
          </section>
        </div>
      </RequireSession>
    </>
  );
}
