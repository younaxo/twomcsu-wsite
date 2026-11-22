import { OrderRefundStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStoreRefundDto {
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason!: string;

  /// Свежий код 2FA (6 цифр TOTP): резервные коды для возврата не принимаются.
  @IsString()
  @Length(6, 8)
  twoFactorCode!: string;

  /// Сумма частичного возврата, десятичная строка (до 2 знаков). Без значения —
  /// возврат остатка оплаченного.
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'Сумма: число до 2 знаков' })
  amount?: string;
}

export class ListStoreRefundsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @IsOptional()
  @IsEnum(OrderRefundStatus)
  status?: OrderRefundStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderId?: string;
}

/// Ручная отметка «возврат не удался» (REFUND_PENDING без ответа провайдера).
export class MarkStoreRefundFailedDto {
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsString()
  @Length(6, 8)
  twoFactorCode!: string;
}
