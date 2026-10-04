import { IsOptional, IsString, Length } from 'class-validator';

/// Итог всегда пересчитывается сервером из текущей корзины (ADR-0009) —
/// targetMinecraftNick позволяет доставить на другой ник, чем username
/// покупателя (например, подарок себе на альт-аккаунт).
export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @Length(1, 16)
  targetMinecraftNick?: string;
}
