import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { cartErrorMessage } from './cart';
import {
  describePaymentMethodError,
  normalizePaymentMethods,
  paymentMethodLabel,
} from './payment-methods';

describe('способы оплаты', () => {
  it('название по коду; неизвестный код — безопасный текст', () => {
    expect(paymentMethodLabel('SBP')).toBe('СБП');
    expect(paymentMethodLabel('CARD_RU')).toBe('Банковская карта (РФ)');
    expect(paymentMethodLabel('WEIRD<script>')).toBe('Другой способ оплаты');
    expect(paymentMethodLabel('toString')).toBe('Другой способ оплаты');
    expect(paymentMethodLabel(null)).toBeNull();
    expect(paymentMethodLabel('')).toBeNull();
  });

  it('разбор списка: мусор отбрасывается, пустой title заменяется', () => {
    expect(normalizePaymentMethods(undefined)).toEqual([]);
    expect(normalizePaymentMethods({ methods: 'x' })).toEqual([]);
    expect(
      normalizePaymentMethods({
        methods: [
          null,
          { code: 'SBP', title: ' ', currency: 'RUB' },
          { code: 'SBP', title: 'дубль', currency: 'RUB' },
          { title: 'без кода' },
        ],
      }),
    ).toEqual([{ code: 'SBP', title: 'СБП', currency: 'RUB' }]);
  });

  it('ошибки выбора способа распознаются только по кодам 0.8b', () => {
    expect(
      describePaymentMethodError(new ApiError(400, ['x'], { code: 'payment_method_invalid' })),
    ).toMatch(/не подходит/);
    expect(
      describePaymentMethodError(new ApiError(400, ['x'], { code: 'nick_required' })),
    ).toBeNull();
    expect(describePaymentMethodError(new Error('x'))).toBeNull();
  });
});

describe('ошибки без сырых сообщений API', () => {
  it('cartErrorMessage: 4xx без известного кода — общий текст по статусу', () => {
    const raw = new ApiError(400, ['Internal: column x violates constraint']);
    expect(cartErrorMessage(raw)).toBe('Проверьте введённые данные и повторите.');
    expect(cartErrorMessage(new ApiError(409, ['dup key']))).toMatch(/Данные изменились/);
    expect(cartErrorMessage(new ApiError(404, ['no row']))).toMatch(/Не найдено/);
    expect(cartErrorMessage(new ApiError(418, ['teapot']), 'Запасной')).toBe('Запасной');
  });

  it('cartErrorMessage: лимит товара — число из ответа, без сырого текста', () => {
    const error = new ApiError(400, ['Максимум 5 шт. за одну покупку'], {
      code: 'CART_MAX_PER_PURCHASE',
    });
    expect(cartErrorMessage(error)).toBe('Достигнут максимум: 5 шт. этого товара за одну покупку.');
  });

  it('safeErrorMessage: сеть, 5xx, не ApiError', () => {
    expect(safeErrorMessage(new NetworkError('boom'))).toMatch(/Нет соединения/);
    expect(safeErrorMessage(new ApiError(502, ['bad gateway']))).toMatch(/временно недоступен/);
    expect(safeErrorMessage(new Error('secret'), 'Запасной')).toBe('Запасной');
  });
});
