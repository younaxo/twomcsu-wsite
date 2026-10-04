import { IsOptional, IsString, Length } from 'class-validator';

/// Опциональное превью с кодом, ещё не применённым к корзине (без
/// сохранения) — применение через отдельный /apply-promo.
export class CalculateCartDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  promoCode?: string;
}
