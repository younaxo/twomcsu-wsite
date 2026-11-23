import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class WalletHistoryQueryDto {
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
}

export class AdjustWalletDto {
  /// Целое со знаком строкой (+ начислить, - списать), не 0. Потолок —
  /// `WALLET_ADJUST_MAX`, проверяет сервис.
  @Matches(/^-?[1-9]\d{0,8}$/, { message: 'Сумма: целое число, не 0' })
  amount!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  reason!: string;

  /// Свежий код 2FA (6 цифр TOTP): резервные коды не принимаются.
  @IsString()
  @Length(6, 8)
  twoFactorCode!: string;

  /// Необязательный ключ повтора: тот же ключ не применит корректировку
  /// дважды (двойной клик, повтор запроса).
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  requestId?: string;
}
