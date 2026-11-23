'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { storeTextsKey, type StoreTextKey, type StoreTexts } from '@/lib/store/texts';

/// Админка магазина, слой 0 / подэтап 0.11: тексты и правила магазина.
/// Контракт — store-settings.controller.ts: GET/PUT /admin/store/settings,
/// право `store.settings.manage`, аудит «было/стало» на сервере. Только простой
/// текст без управляющих символов (переводы строк и табуляция допустимы).

export const STORE_TEXT_FIELDS: {
  key: StoreTextKey;
  label: string;
  max: number;
  hint: string;
  rows: number;
}[] = [
  {
    key: 'store.text.shop_intro',
    label: 'Вступление магазина',
    max: 2000,
    hint: 'Короткий текст над каталогом.',
    rows: 3,
  },
  {
    key: 'store.text.unban_rules',
    label: 'Правила снятия банов',
    max: 4000,
    hint: 'Как и на каких условиях снимается бан.',
    rows: 6,
  },
  {
    key: 'store.text.unmute_rules',
    label: 'Правила снятия мутов',
    max: 4000,
    hint: 'Как и на каких условиях снимается мут.',
    rows: 6,
  },
  {
    key: 'store.text.refund_policy',
    label: 'Политика возвратов',
    max: 8000,
    hint: 'Когда и как возвращаются средства.',
    rows: 8,
  },
  {
    key: 'store.text.perk_descriptions',
    label: 'Описания перков',
    max: 8000,
    hint: 'Только то, что реально есть в игре.',
    rows: 8,
  },
  {
    key: 'store.text.checkout_notice',
    label: 'Уведомление в оформлении заказа',
    max: 2000,
    hint: 'Короткое сообщение на странице оформления.',
    rows: 3,
  },
];

export const STORE_TEXT_MAX: Record<StoreTextKey, number> = Object.fromEntries(
  STORE_TEXT_FIELDS.map((f) => [f.key, f.max]),
) as Record<StoreTextKey, number>;

// eslint-disable-next-line no-control-regex
const BAD_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

/// Предварительная проверка поля; сервер окончательный.
export function validateStoreText(key: StoreTextKey, value: string): string | null {
  if (BAD_CHARS_RE.test(value)) return 'В тексте есть недопустимые управляющие символы.';
  const length = value.trim().length;
  if (length > STORE_TEXT_MAX[key]) {
    return `Слишком длинный текст: ${length} из ${STORE_TEXT_MAX[key]} символов.`;
  }
  return null;
}

const SETTINGS_ERROR_TEXT: Record<string, string> = {
  unknown_setting: 'Неизвестная настройка. Обновите страницу.',
  invalid_setting_value: 'Текст содержит недопустимые управляющие символы.',
  setting_too_long: 'Один из текстов длиннее допустимого.',
  settings_key_protected: 'Эта настройка меняется только через специальный раздел.',
};

export function describeStoreTextsError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Неизвестная ошибка';
  }
  if (error.status === 429) return 'Слишком много попыток. Повторите позже.';
  if (error.status === 403) {
    return error.code === 'admin_2fa_required'
      ? 'Для действий в админке нужна двухфакторная аутентификация. Включите её в настройках аккаунта.'
      : 'Недостаточно прав для этого действия.';
  }
  if (error.code && SETTINGS_ERROR_TEXT[error.code]) return SETTINGS_ERROR_TEXT[error.code]!;
  return error.messages.join('. ');
}

const BASE = '/admin/store/settings';
export const adminStoreTextsKey = ['admin', 'store', 'texts'] as const;

export function useAdminStoreTexts(enabled = true) {
  return useQuery({
    queryKey: adminStoreTextsKey,
    queryFn: () => api.get<Record<StoreTextKey, string>>(BASE),
    enabled,
  });
}

export function useSaveStoreTexts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: StoreTexts) => api.put<Record<StoreTextKey, string>>(BASE, { values }),
    onSuccess: (data) => {
      client.setQueryData(adminStoreTextsKey, data);
      return client.invalidateQueries({ queryKey: storeTextsKey });
    },
  });
}
