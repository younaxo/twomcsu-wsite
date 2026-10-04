import { IsOptional, IsString, Length } from 'class-validator';

/// Берёт товар из СВОЕГО wishlist и добавляет в СВОЮ корзину с
/// giftToUserId = toUsername (покупатель = вызывающий, получатель —
/// другой пользователь).
export class GiftWishlistItemDto {
  @IsString()
  toUsername!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  message?: string;
}
