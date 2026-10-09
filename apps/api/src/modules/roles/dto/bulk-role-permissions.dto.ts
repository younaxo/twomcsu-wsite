import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

/// Массовое изменение прав ролей. По умолчанию — безопасные ADD/REMOVE;
/// REPLACE (одинаковый набор всем) — только с `confirmReplace: true`.
export class BulkRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  roleIds!: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  remove?: string[];

  /// Полная замена набора прав у всех выбранных ролей.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  replace?: string[];

  @IsOptional()
  @IsBoolean()
  confirmReplace?: boolean;
}
