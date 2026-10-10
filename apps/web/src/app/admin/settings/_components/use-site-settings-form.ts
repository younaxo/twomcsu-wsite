'use client';

import type { SiteSettingsDto, UpdateSiteSettingsRequest } from '@twomc/shared';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useUpdateSiteSettings } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';

/// Поля структурированных настроек, которые редактируются в UI. Название,
/// описание, контактный e-mail, логотип и favicon из формы убраны — бренд
/// фиксирован (ADR-0065), контакты поддержки — в конфиге сайта; колонки
/// остаются в backend для совместимости. Соцсети — отдельный список (ADR-0067).
export const EDITABLE_KEYS = [
  'registrationEnabled',
  'registrationRequiresApproval',
  'maxUsersLimit',
  'autoModeration',
  'profanityFilter',
  'metaTitle',
  'metaDescription',
  'googleAnalyticsId',
  'yandexMetrikaId',
  // Флаги модулей (chat/store/…) больше не редактируются здесь — реестр
  // модулей в «Система → Техработы и модули» (ADR-0082).
  'defaultNotificationsEnabled',
  'requireAdmin2fa',
] as const satisfies readonly (keyof SiteSettingsDto)[];

export type EditableKey = (typeof EDITABLE_KEYS)[number];
export type SiteSettingsForm = Pick<SiteSettingsDto, EditableKey> & { metaKeywords: string };

export type BoolKey = {
  [K in EditableKey]: SiteSettingsDto[K] extends boolean ? K : never;
}[EditableKey];
export type TextKey = {
  [K in EditableKey]: SiteSettingsDto[K] extends string | null ? K : never;
}[EditableKey];

function toForm(settings: SiteSettingsDto): SiteSettingsForm {
  const form = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, settings[key]])) as Pick<
    SiteSettingsDto,
    EditableKey
  >;
  return { ...form, metaKeywords: settings.metaKeywords.join(', ') };
}

/// Общее состояние формы для вкладок «Общие», «Модерация», «Модули»: одна
/// плашка сохранения, в запрос уходит только изменённое.
export function useSiteSettingsForm(settings: SiteSettingsDto) {
  const update = useUpdateSiteSettings();
  const initial = useMemo(() => toForm(settings), [settings]);
  const [form, setForm] = useState<SiteSettingsForm>(initial);
  useEffect(() => setForm(initial), [initial]);

  const diff = useMemo(() => {
    const changes: UpdateSiteSettingsRequest = {};
    for (const key of EDITABLE_KEYS) {
      if (form[key] !== initial[key]) {
        (changes as Record<string, unknown>)[key] = form[key] === null ? '' : form[key];
      }
    }
    const keywords = form.metaKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.join('|') !== settings.metaKeywords.join('|')) {
      changes.metaKeywords = keywords;
    }
    return changes;
  }, [form, initial, settings.metaKeywords]);

  const save = async () => {
    try {
      await update.mutateAsync(diff);
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return {
    form,
    setBool: (key: BoolKey, value: boolean) => setForm((f) => ({ ...f, [key]: value })),
    setText: (key: TextKey | 'metaKeywords', value: string) =>
      setForm((f) => ({ ...f, [key]: value })),
    setLimit: (value: number | null) => setForm((f) => ({ ...f, maxUsersLimit: value })),
    changedCount: Object.keys(diff).length,
    reset: () => setForm(initial),
    save,
    saving: update.isPending,
  };
}

export type SiteSettingsFormApi = ReturnType<typeof useSiteSettingsForm>;
