import type {
  PaymentMethodCode,
  PaymentMethodsResponse,
  PublicPaymentMethod,
  StorePaymentErrorCode,
} from '@twomc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/// Выбор способа оплаты (слой 0, подэтап 0.8b, ADR-0193). Клиент видит только код,
/// название и валюту; провайдера не знает. Пустой список способов — выбор не
/// показывается, заказ создаётся прежним путём без `paymentMethod`.

export const paymentMethodKeys = {
  list: ['store', 'payment-methods'] as const,
};

/// Запасные названия по коду: для заказа (в нём приходит только код) и на случай
/// пустого `title`. Неизвестный код — безопасный текст, а не сырой код.
const METHOD_LABELS: Record<PaymentMethodCode, string> = {
  SBP: 'СБП',
  CARD_RU: 'Банковская карта (РФ)',
  SBERPAY: 'SberPay',
  CRYPTO: 'Криптовалюта',
  CARD_FOREIGN: 'Иностранная карта',
};

export function paymentMethodLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(METHOD_LABELS, code)
    ? METHOD_LABELS[code as PaymentMethodCode]
    : 'Другой способ оплаты';
}

const CURRENCY_LABELS: Record<string, string> = {
  RUB: '₽, рубли',
  USD: '$, доллары США',
  EUR: '€, евро',
  USDT: 'USDT',
};

/// Подпись валюты платежа; неизвестную валюту показываем кодом (только буквы и цифры).
export function paymentCurrencyLabel(currency: string): string {
  if (Object.hasOwn(CURRENCY_LABELS, currency)) return CURRENCY_LABELS[currency];
  return currency.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
}

/// Разбор ответа: лишние и битые элементы отбрасываем, пустой `title` заменяем.
export function normalizePaymentMethods(data: unknown): PublicPaymentMethod[] {
  const list = (data as Partial<PaymentMethodsResponse> | null | undefined)?.methods;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: PublicPaymentMethod[] = [];
  for (const raw of list as Array<Partial<PublicPaymentMethod> | null>) {
    if (!raw || typeof raw.code !== 'string' || (raw.code as string) === '' || seen.has(raw.code))
      continue;
    seen.add(raw.code);
    const title =
      typeof raw.title === 'string' && raw.title.trim() !== ''
        ? raw.title.trim()
        : (paymentMethodLabel(raw.code) ?? 'Способ оплаты');
    result.push({
      code: raw.code as PaymentMethodCode,
      title,
      currency: typeof raw.currency === 'string' ? raw.currency : '',
    });
  }
  return result;
}

export function usePaymentMethods(enabled = true) {
  return useQuery({
    queryKey: paymentMethodKeys.list,
    queryFn: async () => {
      try {
        return normalizePaymentMethods(
          await api.get<PaymentMethodsResponse>('/store/payment-methods', { auth: false }),
        );
      } catch (error) {
        // Старый API без маршрута: выбора нет, прежний путь оформления.
        if (error instanceof ApiError && error.status === 404) return [];
        throw error;
      }
    },
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

export interface PaymentChoice {
  methods: PublicPaymentMethod[];
  /// Выбранный код; единственный способ выбирается сам.
  selected: PaymentMethodCode | null;
  select: (code: string) => void;
  /// Список ещё грузится.
  loading: boolean;
  /// Список не загрузился (не 404): оформление блокируется, без него сервер отклонит заказ.
  loadError: unknown;
  retry: () => void;
  retrying: boolean;
  /// Выбор нужен (список непустой).
  required: boolean;
  /// Сбросить выбор и перечитать список (после 400 `payment_method_*`).
  reload: () => void;
}

export function usePaymentChoice(enabled = true): PaymentChoice {
  const client = useQueryClient();
  const query = usePaymentMethods(enabled);
  const [chosen, setChosen] = useState<string | null>(null);
  const methods = query.data ?? [];
  const known = methods.find((method) => method.code === chosen)?.code ?? null;
  const selected = known ?? (methods.length === 1 ? methods[0].code : null);
  const reload = useCallback(() => {
    setChosen(null);
    void client.invalidateQueries({ queryKey: paymentMethodKeys.list });
  }, [client]);
  return {
    methods,
    selected,
    select: setChosen,
    loading: enabled && query.isPending,
    loadError: query.isError ? query.error : null,
    retry: () => void query.refetch(),
    retrying: query.isFetching,
    required: methods.length > 0,
    reload,
  };
}

export type PaymentErrorCode = StorePaymentErrorCode;

const PAYMENT_ERROR_TEXT: Record<PaymentErrorCode, string> = {
  payment_method_required: 'Выберите способ оплаты.',
  payment_method_invalid: 'Выбранный способ оплаты не подходит. Выберите другой из списка.',
  payment_method_unavailable:
    'Этот способ оплаты сейчас недоступен. Список обновлён, выберите другой способ.',
};

/// Ошибка выбора способа (400): текст для игрока. Не относится к способу — null.
export function describePaymentMethodError(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  return Object.hasOwn(PAYMENT_ERROR_TEXT, error.code)
    ? PAYMENT_ERROR_TEXT[error.code as PaymentErrorCode]
    : null;
}
