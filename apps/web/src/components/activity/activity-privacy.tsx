'use client';

import type { ActivityVisibility } from '@twomc/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import { useActivitySettings, useUpdateActivitySettings } from '@/lib/activity/hooks';

/// «Лента активности» в «Приватности» (срез 2.6, ADR-0114): только настройки,
/// которые сайт реально применяет — записи о новой дружбе (показывать, кому) и
/// уведомления о комментариях к своей активности. Остальные типы записей
/// появятся вместе с функциями, которые их создают.

const VISIBILITY: Array<{ value: ActivityVisibility; label: string }> = [
  { value: 'PUBLIC', label: 'Всем' },
  { value: 'FRIENDS', label: 'Только друзьям' },
  { value: 'PRIVATE', label: 'Только мне' },
];

export function ActivityPrivacy() {
  const settings = useActivitySettings();
  const update = useUpdateActivitySettings();
  const save = (body: Parameters<typeof update.mutateAsync>[0]) =>
    update.mutateAsync(body).catch((error) => toast.error(getErrorMessage(error)));

  return (
    <section
      className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm"
      aria-label="Лента активности"
      data-testid="activity-privacy"
    >
      <h3 className="text-sm font-semibold">Лента активности</h3>
      {settings.isPending ? (
        <SkeletonRows rows={2} />
      ) : settings.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(settings.error)}
        </p>
      ) : (
        <>
          <SwitchField
            label="Показывать новые дружбы"
            description="Запись «Теперь дружит с …» в ленте и в профиле."
            checked={settings.data.showFriendships}
            disabled={update.isPending}
            onCheckedChange={(showFriendships) => void save({ showFriendships })}
          />
          {settings.data.showFriendships ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">Кто видит записи о дружбе</span>
              <Select
                value={settings.data.friendshipsVisibility}
                disabled={update.isPending}
                onValueChange={(value) =>
                  void save({ friendshipsVisibility: value as ActivityVisibility })
                }
              >
                <SelectTrigger className="w-52" aria-label="Кто видит записи о дружбе">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <SwitchField
            label="Комментарии к моей активности"
            description="Уведомлять, когда кто-то комментирует ваши записи."
            checked={settings.data.notifyOnComment}
            disabled={update.isPending}
            onCheckedChange={(notifyOnComment) => void save({ notifyOnComment })}
          />
        </>
      )}
    </section>
  );
}
