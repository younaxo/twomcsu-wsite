import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateCurrencyRateDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsString()
  @Length(1, 5)
  symbol?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  flag?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
