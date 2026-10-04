import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum BulkUserAction {
  BAN = 'BAN',
  UNBAN = 'UNBAN',
}

export class BulkUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds!: string[];

  @IsEnum(BulkUserAction)
  action!: BulkUserAction;

  @IsOptional()
  @IsString()
  reason?: string;

  /// Только для action=BAN; без значения — перманентный бан.
  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;
}
