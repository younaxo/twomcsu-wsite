'use client';

import {
  CONNECTED_SOCIAL_PLATFORMS,
  SOCIAL_PLATFORMS,
  type Gender,
  type OwnProfileDto,
  type SocialPlatform,
  type UpdateOwnProfileRequest,
} from '@twomc/shared';
import { ImageUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import { ProfileBanner } from '@/components/profile/profile-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
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
import {
  useOwnProfile,
  useProfileImage,
  useSaveSocialLink,
  useSocialLinks,
  useUpdateProfile,
  type ProfileImageKind,
} from '@/lib/account/hooks';
import { getErrorMessage } from '@/lib/api/errors';

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Мужской' },
  { value: 'FEMALE', label: 'Женский' },
  { value: 'OTHER', label: 'Другой' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Не указывать' },
];

const SOCIAL_LABELS: Record<SocialPlatform, { label: string; placeholder: string }> = {
  DISCORD: { label: 'Discord', placeholder: 'ник или ссылка-приглашение' },
  TELEGRAM: { label: 'Telegram', placeholder: '@username' },
  VK: { label: 'ВКонтакте', placeholder: 'vk.com/…' },
  YOUTUBE: { label: 'YouTube', placeholder: 'youtube.com/@…' },
  TWITCH: { label: 'Twitch', placeholder: 'twitch.tv/…' },
  TIKTOK: { label: 'TikTok', placeholder: '@username' },
  STEAM: { label: 'Steam', placeholder: 'steamcommunity.com/id/…' },
  GITHUB: { label: 'GitHub', placeholder: 'ник или https://github.com/…' },
  WEBSITE: { label: 'Сайт', placeholder: 'https://…' },
};

type ProfileForm = Pick<
  UpdateOwnProfileRequest,
  'statusText' | 'bio' | 'country' | 'city' | 'gender' | 'birthDate' | 'showBirthDate'
>;

function toForm(profile: OwnProfileDto): ProfileForm {
  return {
    statusText: profile.statusText ?? '',
    bio: profile.bio ?? '',
    country: profile.country ?? '',
    city: profile.city ?? '',
    gender: profile.gender,
    birthDate: profile.birthDate ? profile.birthDate.slice(0, 10) : null,
    showBirthDate: profile.showBirthDate,
  };
}

/// Загрузка аватара или баннера: выбор файла → POST multipart; удаление.
function ImageField({ kind, profile }: { kind: ProfileImageKind; profile: OwnProfileDto }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove } = useProfileImage(kind);
  const current = kind === 'avatar' ? profile.avatar : profile.banner;
  const label = kind === 'avatar' ? 'Аватар' : 'Баннер';
  const hint =
    kind === 'avatar' ? 'PNG, JPG, WebP до 5 МБ, 512×512' : 'PNG, JPG, WebP до 10 МБ, 1920×480';
  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid={`image-${kind}`}>
      {kind === 'avatar' ? (
        <Avatar src={current} name={profile.username} size="xl" />
      ) : (
        <div role="img" aria-label={current ? 'Текущий баннер' : 'Баннер не загружен'}>
          <ProfileBanner src={current ?? null} className="h-16 w-40 rounded-lg" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="flex gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`Загрузить: ${label.toLowerCase()}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void run(() => upload.mutateAsync(file), `${label} обновлён`);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <ImageUp />
            Загрузить
          </Button>
          {current ? (
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              onClick={() => void run(() => remove.mutateAsync(), `${label} удалён`)}
            >
              <Trash2 />
              Удалить
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SocialLinksEditor() {
  const query = useSocialLinks();
  const save = useSaveSocialLink();
  const [values, setValues] = useState<Partial<Record<SocialPlatform, string>>>({});
  useEffect(() => {
    if (query.data) {
      setValues(Object.fromEntries(query.data.map((link) => [link.platform, link.value])));
    }
  }, [query.data]);
  const saved = Object.fromEntries((query.data ?? []).map((link) => [link.platform, link.value]));
  const commit = async (platform: SocialPlatform) => {
    const value = values[platform]?.trim() ?? '';
    if (value === (saved[platform] ?? '')) return;
    try {
      await save.mutateAsync({ platform, value: value || null });
      toast.success(value ? 'Ссылка сохранена' : 'Ссылка удалена');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  return (
    <section className={island} aria-label="Соцсети">
      <div>
        <h3 className="text-sm font-semibold">Соцсети</h3>
        <p className="text-xs text-muted-foreground">
          Сохраняется при выходе из поля. Пустое поле — ссылка удаляется.
        </p>
      </div>
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} />}>
        {() => (
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.filter(
              (platform) => !CONNECTED_SOCIAL_PLATFORMS.includes(platform),
            ).map((platform) => (
              <Field key={platform} label={SOCIAL_LABELS[platform].label}>
                <Input
                  value={values[platform] ?? ''}
                  maxLength={200}
                  placeholder={SOCIAL_LABELS[platform].placeholder}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [platform]: event.target.value }))
                  }
                  onBlur={() => void commit(platform)}
                />
              </Field>
            ))}
          </div>
        )}
      </QueryBoundary>
    </section>
  );
}

function ProfileEditor({ profile }: { profile: OwnProfileDto }) {
  const update = useUpdateProfile();
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  useEffect(() => setForm(toForm(profile)), [profile]);
  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(toForm(profile));

  const submit = async () => {
    try {
      await update.mutateAsync({
        statusText: form.statusText?.trim() || null,
        bio: form.bio?.trim() || null,
        country: form.country?.trim() || null,
        city: form.city?.trim() || null,
        gender: form.gender ?? null,
        birthDate: form.birthDate ?? null,
        showBirthDate: form.showBirthDate,
      } as UpdateOwnProfileRequest);
      toast.success('Профиль сохранён');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className={island} aria-label="Изображения">
        <ImageField kind="avatar" profile={profile} />
        <ImageField kind="banner" profile={profile} />
      </section>

      <section className={island} aria-label="О себе">
        <Field label="Статус" hint="Короткая строка под ником">
          <Input
            value={form.statusText ?? ''}
            maxLength={128}
            onChange={(event) => set('statusText', event.target.value)}
          />
        </Field>
        <Field label="О себе">
          <Textarea
            rows={4}
            value={form.bio ?? ''}
            maxLength={500}
            onChange={(event) => set('bio', event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Страна">
            <Input
              value={form.country ?? ''}
              maxLength={100}
              onChange={(event) => set('country', event.target.value)}
            />
          </Field>
          <Field label="Город">
            <Input
              value={form.city ?? ''}
              maxLength={100}
              onChange={(event) => set('city', event.target.value)}
            />
          </Field>
          <Field label="Пол">
            <Select
              value={form.gender ?? undefined}
              onValueChange={(value) => set('gender', value as Gender)}
            >
              <SelectTrigger aria-label="Пол">
                <SelectValue placeholder="Не указан" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Дата рождения">
            <DatePicker
              value={form.birthDate ?? null}
              clearable
              onChange={(value) => set('birthDate', value)}
            />
          </Field>
        </div>
        <SwitchField
          label="Показывать дату рождения в профиле"
          checked={form.showBirthDate ?? false}
          onCheckedChange={(value) => set('showBirthDate', value)}
        />
        <div>
          <Button onClick={submit} loading={update.isPending} disabled={!changed}>
            Сохранить
          </Button>
        </div>
      </section>

      <SocialLinksEditor />
    </div>
  );
}

/// «Настройки → Профиль»: аватар, баннер, о себе, соцсети.
export default function ProfileSettingsPage() {
  const query = useOwnProfile();
  return (
    <>
      <PageHeader title="Профиль" description="Как вас видят другие игроки twomc.su." />
      <RequireSession>
        <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
          {(profile) => <ProfileEditor profile={profile} />}
        </QueryBoundary>
      </RequireSession>
    </>
  );
}
