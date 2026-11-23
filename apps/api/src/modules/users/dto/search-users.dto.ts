import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchUsersDto {
  /// Запрос по нику: минимум 2 символа после обрезки пробелов (Q73).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page: number = 1;
}
