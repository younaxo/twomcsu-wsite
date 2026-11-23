import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  describeQuickBuyError,
  extractGuestToken,
  guestOrderLink,
  validateNick,
} from './quick-buy';

const err = (status: number, code?: string) =>
  new ApiError(status, ['x'], code ? { code } : undefined);

describe('validateNick', () => {
  it.each(['Steve', 'a_b', 'Name_1234567890'.slice(0, 16), 'abc'])('принимает %s', (nick) => {
    expect(validateNick(nick)).toBeNull();
  });
  it.each(['', '  ', 'ab', 'a'.repeat(17), 'Ник', 'a b c', 'a-b-c', 'a.b.c'])(
    'отклоняет %j',
    (nick) => {
      expect(validateNick(nick)).not.toBeNull();
    },
  );
});

describe('describeQuickBuyError', () => {
  it('nick_unavailable', () => {
    expect(describeQuickBuyError(err(400, 'nick_unavailable'))).toEqual({
      kind: 'nick',
      message: 'Покупка для этого ника недоступна',
    });
  });
  it('429', () => {
    expect(describeQuickBuyError(err(429)).message).toBe(
      'Слишком много попыток, попробуйте через минуту',
    );
  });
  it('login_required', () => {
    expect(describeQuickBuyError(err(403, 'login_required'))).toMatchObject({
      kind: 'login_required',
      message: 'Войдите, чтобы купить этот товар',
    });
  });
  it('paid_removal_unavailable', () => {
    expect(describeQuickBuyError(err(503, 'paid_removal_unavailable'))).toMatchObject({
      kind: 'paid_removal_unavailable',
      message: 'Снятие наказаний временно недоступно',
    });
  });
  it('quick_buy_disabled', () => {
    expect(describeQuickBuyError(err(403, 'quick_buy_disabled')).kind).toBe('disabled');
  });
  it('неизвестная ошибка не раскрывает детали', () => {
    expect(describeQuickBuyError(new Error('boom')).message).not.toContain('boom');
  });
});

describe('ссылка и токен', () => {
  it('токен во фрагменте, не в query', () => {
    const link = guestOrderLink('abc_DEF-123', 'https://twomc.su');
    expect(link).toBe('https://twomc.su/shop/order/guest#t=abc_DEF-123');
    expect(link).not.toContain('?');
  });
  it('извлекает токен из фрагмента, ссылки и голого значения', () => {
    expect(extractGuestToken('#t=abc123')).toBe('abc123');
    expect(extractGuestToken('https://twomc.su/shop/order/guest#t=abc123')).toBe('abc123');
    expect(extractGuestToken('  abc123  ')).toBe('abc123');
    expect(extractGuestToken('#abc123')).toBe('abc123');
  });
});
