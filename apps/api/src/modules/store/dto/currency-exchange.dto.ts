import { IsNumber, IsString, Length, Min } from 'class-validator';

export class CurrencyExchangeDto {
  @IsString()
  @Length(1, 10)
  fromCurrency!: string;

  @IsString()
  @Length(1, 10)
  toCurrency!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
