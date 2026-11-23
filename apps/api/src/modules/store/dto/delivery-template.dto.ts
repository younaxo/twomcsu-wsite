import { ProductDuration } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertDeliveryTemplateDto {
  /// Без варианта — шаблон всего товара.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  /// Строгая проверка (белый список символов и переменных) — в валидаторе;
  /// здесь только грубый предел, чтобы не принимать мегабайты.
  @IsString()
  @MaxLength(1000)
  template!: string;

  /// Свежий код 2FA (TOTP); резервные коды не принимаются.
  @IsString()
  @Length(6, 8)
  twoFactorCode!: string;
}

export class PreviewDeliveryTemplateDto {
  @IsString()
  @MaxLength(1000)
  template!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsEnum(ProductDuration)
  duration!: ProductDuration;
}

export class ListDeliveryTemplatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;
}

export class SetCommandRootsDto {
  /// Дополнительные корни команд (первое слово шаблона); запрещённые
  /// отклоняются валидатором.
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  roots!: string[];

  @IsString()
  @Length(6, 8)
  twoFactorCode!: string;
}
