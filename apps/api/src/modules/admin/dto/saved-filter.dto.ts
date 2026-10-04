import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SavedFilterDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  /// Идентификатор страницы/списка админки, к которому относится фильтр
  /// (например `users`, `orders`, `reports`) — свободная строка, т.к.
  /// список страниц админки не фиксирован схемой.
  @IsString()
  @MaxLength(100)
  page!: string;

  @IsObject()
  filters!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
