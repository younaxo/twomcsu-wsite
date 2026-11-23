import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/// Эндпоинт без авторизации (API-REFERENCE: "NONE (no guard)") — всегда
/// анонимный быстрый заказ, требует guestMinecraftNick для доставки.
export class QuickBuyDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsString()
  @Length(1, 16)
  guestMinecraftNick!: string;

  /// Версия оферты, принятая покупателем (0.5); проверяется сервисом.
  @IsOptional()
  @IsString()
  @Length(1, 32)
  offerVersion?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  /// Способ оплаты (0.8b, ADR-0193): код из GET /store/payment-methods. Проверяет
  /// маршрутизатор со своими кодами (payment_method_*), не общая валидация.
  @IsOptional()
  @IsString()
  @Length(1, 32)
  paymentMethod?: string;
}
