import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsQueryDto {
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

  /// `?unreadOnly=true|false` — строку разбираем явно: `@Type(() => Boolean)`
  /// превращал «false» в true.
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1'
      ? true
      : value === false || value === 'false' || value === '0'
        ? false
        : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;

  /// `?type=system` — только системные сообщения twomc.su (ADR-0080).
  @IsOptional()
  @IsIn(['system'])
  type?: 'system';
}
