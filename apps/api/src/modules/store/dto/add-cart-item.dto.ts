import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

/// Ровно один из variantId/bundleId — проверяется сервисом (зависит от
/// того, что выбрано), не декоратором.
export class AddCartItemDto {
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  bundleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  /// Ник получателя: формат как при регистрации (3–16, латиница/цифры/_).
  /// Пустая строка = снять подарок.
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @Length(3, 16)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      'Ник может содержать только латинские буквы, цифры и подчёркивание',
  })
  giftToUsername?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  giftMessage?: string;
}
