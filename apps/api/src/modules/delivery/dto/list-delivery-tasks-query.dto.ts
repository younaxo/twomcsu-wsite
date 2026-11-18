import { DeliveryTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListDeliveryTasksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @IsOptional()
  @IsEnum(DeliveryTaskStatus)
  status?: DeliveryTaskStatus;

  /// manual | site | command | ... (строка: набор исполнителей расширяемый).
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]{1,16}$/)
  executor?: string;

  /// Часть номера заказа (без учёта регистра).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderNumber?: string;

  /// Часть ника получателя (без учёта регистра).
  @IsOptional()
  @IsString()
  @MaxLength(16)
  nick?: string;
}
