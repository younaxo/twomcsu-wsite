import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateCartItemDto {
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
