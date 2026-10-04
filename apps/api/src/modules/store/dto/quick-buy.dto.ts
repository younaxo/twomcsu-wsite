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

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
