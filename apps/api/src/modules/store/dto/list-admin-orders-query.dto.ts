import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAdminOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /// Часть номера заказа (без учёта регистра).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderNumber?: string;

  /// Часть ника: логин покупателя или ник гостя.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  /// Фильтр по `createdAt >=` (используется также `/admin/finance/transactions`).
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /// Фильтр по `createdAt <=`.
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
