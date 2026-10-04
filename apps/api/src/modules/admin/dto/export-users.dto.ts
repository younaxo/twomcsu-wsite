import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class ExportUsersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  isBanned?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
