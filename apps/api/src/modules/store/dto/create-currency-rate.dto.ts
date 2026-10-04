import { IsNumber, IsString, Length, Min } from 'class-validator';

export class CreateCurrencyRateDto {
  @IsString()
  @Length(1, 10)
  currency!: string;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsString()
  @Length(1, 5)
  symbol!: string;

  @IsString()
  @Length(1, 10)
  flag!: string;
}
