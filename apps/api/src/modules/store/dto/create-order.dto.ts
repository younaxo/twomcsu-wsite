import { IsOptional, IsString, Length } from 'class-validator';

/// Итог всегда пересчитывается сервером из текущей корзины (ADR-0009).
/// targetMinecraftNick — ник получателя; без него берётся привязанный ник
/// покупателя (0.5, ADR-0186). offerVersion — версия оферты, принятая
/// покупателем (0.5): отсутствие версии проверяет сервис с собственным кодом
/// `offer_not_accepted`, а не общей ошибкой валидации.
export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @Length(1, 16)
  targetMinecraftNick?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  offerVersion?: string;
}
