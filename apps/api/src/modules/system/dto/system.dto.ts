import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
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
