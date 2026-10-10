import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class UpdateSiteModuleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}

export class UpdateMaintenanceDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['full', 'partial'])
  scope!: 'full' | 'partial';

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  modules!: string[];

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 1000)
  message!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  reason?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  estimatedEnd?: string | null;
}

const CATEGORIES = ['audit', 'security', 'serverStatus', 'technical'] as const;

export class StorageRetentionMapDto {
  @IsOptional()
  @IsIn([7, 30, 90, 180, 365, 0])
  audit?: number;

  @IsOptional()
  @IsIn([7, 30, 90, 180, 365, 0])
  security?: number;

  @IsOptional()
  @IsIn([7, 30, 90, 180, 365, 0])
  serverStatus?: number;

  @IsOptional()
  @IsIn([7, 30, 90, 180, 365, 0])
  technical?: number;
}

export class UpdateStorageRetentionDto {
  @IsOptional()
  @IsBoolean()
  autoCleanup?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => StorageRetentionMapDto)
  retention?: StorageRetentionMapDto;
}

export class StorageCleanupPreviewDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  /// null — все записи категории.
  @ValidateIf((_, value) => value !== null)
  @IsIn([7, 30, 90, 180, 365])
  olderThanDays!: number | null;
}

export class StorageCleanupDto extends StorageCleanupPreviewDto {
  @IsInt()
  @Min(0)
  confirmCount!: number;
}
