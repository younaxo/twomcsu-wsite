import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/// Машинные коды ошибок кошелька (0.15, ADR-0191).
export const WalletError = {
  DISABLED: 'wallet_disabled',
  INSUFFICIENT: 'wallet_insufficient',
  INCONSISTENT: 'wallet_inconsistent',
  IDEMPOTENCY_CONFLICT: 'wallet_idempotency_conflict',
  AMOUNT_INVALID: 'wallet_amount_invalid',
  ADJUST_LIMIT: 'wallet_adjust_limit',
  REASON_REQUIRED: 'wallet_reason_required',
  TWO_FACTOR_REQUIRED: 'wallet_two_factor_required',
  TWO_FACTOR_INVALID: 'wallet_two_factor_invalid',
  TWO_FACTOR_LOCKED: 'wallet_two_factor_locked',
  USER_NOT_FOUND: 'wallet_user_not_found',
} as const;

export type WalletErrorCode = (typeof WalletError)[keyof typeof WalletError];

export const walletDisabled = () =>
  new ServiceUnavailableException({
    code: WalletError.DISABLED,
    message: 'Кошелёк отключён',
  });

export const walletInsufficient = () =>
  new ConflictException({
    code: WalletError.INSUFFICIENT,
    message: 'Недостаточно рубинов на балансе',
  });

export const walletInconsistent = () =>
  new InternalServerErrorException({
    code: WalletError.INCONSISTENT,
    message: 'Баланс не совпадает с журналом, операция отклонена',
  });

export const walletIdempotencyConflict = () =>
  new ConflictException({
    code: WalletError.IDEMPOTENCY_CONFLICT,
    message: 'Ключ идемпотентности уже использован с другими данными',
  });

export const walletBadRequest = (code: WalletErrorCode, message: string) =>
  new BadRequestException({ code, message });

export const walletForbidden = (code: WalletErrorCode, message: string) =>
  new ForbiddenException({ code, message });

export const walletUserNotFound = () =>
  new NotFoundException({
    code: WalletError.USER_NOT_FOUND,
    message: 'Пользователь не найден',
  });

export const walletTwoFactorLocked = () =>
  new HttpException(
    {
      code: WalletError.TWO_FACTOR_LOCKED,
      message: 'Слишком много неверных кодов. Повторите позже',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
